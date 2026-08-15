/**
 * TUI runtime — the real terminal entry point (scope §4 + A1).
 *
 * {@link runTui} builds a `ProcessTerminal` + `TuiAltScreen`, installs the
 * keymap, sets the layout root, focuses the composer, wires the input listener
 * for Ctrl+O / double-Esc / Ctrl+C quit-with-confirm, runs the event loop, and
 * tears down cleanly. {@link resolveRunMode} decides `local` vs `managed` from
 * `CORTEX_PROJECT` + a Cortex health probe (A1: unreachable ⇒ local, no crash).
 */

import path from "node:path";
import { ProcessTerminal, TuiAltScreen } from "@earendil-works/pi-tui";
import {
  CortexClient,
  CortexCheckpoint,
  DEFAULT_CORTEX_API_URL,
  InProcessTransport,
  MissingApiKeyError,
  SessionStore,
  listSessions,
  readSessionMessages,
} from "@openkai/core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { buildTuiApp, type RunMode, type ExitRequest } from "./app.js";
import { installKeymap, isToggleThinking, isQuit, DoubleEscDetector } from "./keymap.js";

/** Options for {@link runTui}. */
export interface RunTuiOptions {
  /** Override the OpenRouter model id (default: env `OPENKAI_MODEL` or built-in). */
  model?: string;
  /** Resume a session by id (loads its v3 tree, replays, continues the branch). */
  session?: string;
  /** System prompt override. */
  systemPrompt?: string;
  /** Cortex project override (default: env `CORTEX_PROJECT`). */
  project?: string;
  /** Cortex API base URL override. */
  api?: string;
  /** Agent name for Cortex writes. */
  agent?: string;
  /** Root for the local session store (default: `.openkai/sessions`). */
  sessionsRoot?: string;
  /** Suppress startup diagnostics. */
  quiet?: boolean;
}

/** Resolved run mode + wiring (A1). */
export interface ResolvedRunMode {
  mode: RunMode;
  /** Project key (`openkai` default even in local mode, for the local store path). */
  project: string;
  /** Persist-mode label for the chrome. */
  persistMode: string;
  /** Cortex client (only constructed in managed mode). */
  cortex?: CortexClient;
  /** True when the Cortex health probe succeeded. */
  cortexReachable: boolean;
}

/**
 * Resolve the run mode (A1). `CORTEX_PROJECT` unset or the Cortex API
 * unreachable ⇒ `local` (no checkpoints, chrome shows `local`, no crash). Set
 * + reachable ⇒ `managed` (checkpoints on, chrome shows the project key).
 */
export async function resolveRunMode(options: RunTuiOptions): Promise<ResolvedRunMode> {
  const project = options.project ?? process.env.CORTEX_PROJECT ?? "openkai";
  const baseUrl = options.api ?? process.env.CORTEX_API_URL ?? DEFAULT_CORTEX_API_URL;
  const cortexProject = process.env.CORTEX_PROJECT;

  // No project env var ⇒ standalone-local (A1).
  if (!cortexProject) {
    return { mode: "local", project, persistMode: "local", cortexReachable: false };
  }

  // Project set — probe Cortex health. Unreachable ⇒ local (no crash).
  const cortex = new CortexClient({ baseUrl, project, agent: options.agent });
  try {
    await cortex.health();
    return { mode: "managed", project, persistMode: project, cortex, cortexReachable: true };
  } catch {
    return { mode: "local", project, persistMode: "local", cortexReachable: false };
  }
}

/**
 * Run the TUI against the real terminal. Returns the exit code.
 *
 * Loops over {@link runSession} so `/new` and `/resume <id>` can tear the
 * session down and rebuild against a different session id without leaving the
 * process (scope §4).
 */
export async function runTui(options: RunTuiOptions): Promise<number> {
  let session = options.session;
  for (;;) {
    const { code, next } = await runSession({ ...options, session });
    if (next.kind === "quit") return code;
    // `/new` ⇒ no id ⇒ the store mints a fresh one; `/resume <id>` ⇒ that id.
    session = next.sessionId;
  }
}

/** Run one session to its exit request. Returns the code + what to do next. */
async function runSession(options: RunTuiOptions): Promise<{ code: number; next: ExitRequest }> {
  const modelId = options.model ?? process.env.OPENKAI_MODEL ?? "nvidia/nemotron-3-nano-30b-a3b:free";
  const agent = options.agent ?? process.env.OPENKAI_AGENT ?? "openkai";
  const cwd = process.cwd();
  const sessionsRoot = options.sessionsRoot ?? path.join(cwd, ".openkai", "sessions");

  // ── A1: resolve run mode (no crash when Cortex is unreachable) ──────────
  const runMode = await resolveRunMode(options);

  // ── Local session store (always — both modes persist locally) ──────────
  const store = new SessionStore({
    root: sessionsRoot,
    sessionId: options.session,
  });
  await store.ensure();

  // ── Session resume: replay prior messages into the transcript + agent ──
  let replayMessages: AgentMessage[] = [];
  if (options.session) {
    try {
      replayMessages = await readSessionMessages(store.filePath);
    } catch (error) {
      if (!options.quiet) process.stderr.write(`[openkai] resume failed: ${error instanceof Error ? error.message : String(error)}\n`);
      return { code: 1, next: { kind: "quit" } };
    }
  }

  // ── Cortex checkpoint (managed mode only; undefined in local mode) ─────
  let checkpoint: CortexCheckpoint | undefined;
  if (runMode.mode === "managed" && runMode.cortex) {
    checkpoint = new CortexCheckpoint({
      client: runMode.cortex,
      agent,
      sessionId: store.sessionId,
      sourcePath: path.resolve(store.filePath),
      provider: "openrouter",
      modelId,
      cwd,
      task: "openkai tui",
    });
  }

  // ── Transport (Agent over OpenRouter — same loop as `openkai chat`) ─────
  let transport: InProcessTransport;
  try {
    transport = new InProcessTransport({
      sessionId: store.sessionId,
      modelId,
      systemPrompt: options.systemPrompt,
      cwd,
      initialMessages: replayMessages,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      process.stderr.write(`${error.message}\n`);
      return { code: 1, next: { kind: "quit" } };
    }
    throw error;
  }

  // ── Terminal + alt-screen + keymap ──────────────────────────────────────
  const terminal = new ProcessTerminal();
  const tui = new TuiAltScreen(terminal, true);
  const manager = installKeymap();

  // Exit signalling: one promise, resolved once, by whichever path fires first
  // (Ctrl+C×2, `/quit`, `/new`, `/resume`). No polling timers — an uncleared
  // interval would keep the event loop alive and hang the process on exit.
  let signalExit!: (request: ExitRequest) => void;
  const exitRequested = new Promise<ExitRequest>((resolve) => {
    signalExit = resolve;
  });
  let exitSignalled = false;
  const requestExit = (request: ExitRequest): void => {
    if (exitSignalled) return;
    exitSignalled = true;
    signalExit(request);
  };

  const app = buildTuiApp(tui, {
    transport,
    modelId,
    sessionId: store.sessionId,
    persistMode: runMode.persistMode,
    store,
    checkpoint,
    replayMessages,
    sessionsRoot,
    onExit: requestExit,
  });
  const { root, composer, controller } = app;

  tui.setLayoutRoot(root);
  tui.setFocus(composer.editor);

  // ── Input listener: Ctrl+O density, double-Esc clear, Ctrl+C quit-confirm ─
  const escDetector = new DoubleEscDetector();
  let lastQuitConfirmAt = 0;

  tui.addInputListener((data) => {
    // Ctrl+O → toggle thinking density (scope §3.3).
    if (isToggleThinking(data, manager)) {
      const revealed = controller.toggleThinking();
      tui.flash(revealed ? "thinking: shown" : "thinking: hidden");
      return { consume: true };
    }
    // Double-Esc → clear draft (scope §3.5).
    if (escDetector.feed(data)) {
      composer.clear();
      tui.flash("draft cleared");
      return { consume: true };
    }
    // Ctrl+C → quit-with-confirm (scope §3.5).
    if (isQuit(data, manager)) {
      const now = Date.now();
      if (lastQuitConfirmAt > 0 && now - lastQuitConfirmAt <= 700) {
        requestExit({ kind: "quit" });
        return { consume: true };
      }
      lastQuitConfirmAt = now;
      tui.flash("Press Ctrl+C again to quit");
      return { consume: true };
    }
    return undefined;
  });

  // ── Start the terminal + event loop ────────────────────────────────────
  tui.start();

  if (!options.quiet) {
    process.stderr.write(
      `[openkai] tui ready · mode=${runMode.mode} · model=${modelId} · session=${store.sessionId.slice(0, 8)}\n`,
    );
    if (runMode.mode === "local") {
      process.stderr.write(`[openkai] local mode — Cortex unreachable or unset; persisting locally only.\n`);
    }
  }

  // Run the controller event loop concurrently. Whichever finishes first wins:
  // the user asking to exit, or the transport stream ending on its own.
  const consumePromise = controller.consume();
  const next = await Promise.race([
    exitRequested,
    consumePromise.then((): ExitRequest => ({ kind: "quit" })).catch((): ExitRequest => ({ kind: "quit" })),
  ]);

  await controller.shutdown();
  await consumePromise.catch(() => undefined);

  tui.stop();
  await terminal.drainInput();
  return { code: 0, next };
}
