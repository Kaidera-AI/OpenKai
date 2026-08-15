/**
 * TUI runtime — the real terminal entry point (scope §4 + A1).
 *
 * {@link runTui} builds a `ProcessTerminal` + `TuiAltScreen`, installs the
 * keymap, sets the layout root, focuses the composer, wires the input listener
 * for the leader keys (Ctrl+K palette, Ctrl+S stash, scope §1.3/§1.4),
 * focus-aware attention (scope §1.1), Ctrl+O density, double-Esc clear,
 * Ctrl+C quit-with-confirm, runs the event loop, and tears down cleanly.
 * {@link resolveRunMode} decides `local` vs `managed` from `CORTEX_PROJECT` +
 * a Cortex health probe (A1: unreachable ⇒ local, no crash).
 *
 * P4b wiring (scope §1):
 *  - DEC 1004 focus reporting → {@link AttentionNotifier} (quiet when focused).
 *  - Frecency history persisted under `.openkai/history.json` (scope §1.4),
 *    seeded into the composer at startup so up-arrow recalls by frecency.
 *  - `/undo` wired to `transport.undoLastMutation()` via the `onUndo` callback.
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
import {
  installKeymap,
  isToggleThinking,
  isQuit,
  isOpenPalette,
  isStash,
  DoubleEscDetector,
} from "./keymap.js";
import {
  AttentionNotifier,
  FOCUS_REPORT_ENABLE,
  FOCUS_REPORT_DISABLE,
  isFocusIn,
  isFocusOut,
} from "./attention.js";
import { FrecencyHistory } from "./stash.js";

/** Options for {@link runTui}. */
export interface RunTuiOptions {
  model?: string;
  session?: string;
  systemPrompt?: string;
  project?: string;
  api?: string;
  agent?: string;
  sessionsRoot?: string;
  quiet?: boolean;
}

/** Resolved run mode + wiring (A1). */
export interface ResolvedRunMode {
  mode: RunMode;
  project: string;
  persistMode: string;
  cortex?: CortexClient;
  cortexReachable: boolean;
}

/**
 * Resolve the run mode (A1). `CORTEX_PROJECT` unset or Cortex unreachable ⇒
 * `local` (no checkpoints, chrome shows `local`, no crash). Set + reachable ⇒
 * `managed` (checkpoints on, chrome shows the project key).
 */
export async function resolveRunMode(options: RunTuiOptions): Promise<ResolvedRunMode> {
  const project = options.project ?? process.env.CORTEX_PROJECT ?? "openkai";
  const baseUrl = options.api ?? process.env.CORTEX_API_URL ?? DEFAULT_CORTEX_API_URL;
  const cortexProject = process.env.CORTEX_PROJECT;
  if (!cortexProject) {
    return { mode: "local", project, persistMode: "local", cortexReachable: false };
  }
  const cortex = new CortexClient({ baseUrl, project, agent: options.agent });
  try {
    await cortex.health();
    return { mode: "managed", project, persistMode: project, cortex, cortexReachable: true };
  } catch {
    return { mode: "local", project, persistMode: "local", cortexReachable: false };
  }
}

/**
 * Run the TUI against the real terminal. Loops over {@link runSession} so
 * `/new` and `/resume <id>` rebuild against a different session id.
 */
export async function runTui(options: RunTuiOptions): Promise<number> {
  let session = options.session;
  for (;;) {
    const { code, next } = await runSession({ ...options, session });
    if (next.kind === "quit") return code;
    session = next.sessionId;
  }
}

/** Run one session to its exit request. */
async function runSession(options: RunTuiOptions): Promise<{ code: number; next: ExitRequest }> {
  const modelId = options.model ?? process.env.OPENKAI_MODEL ?? "nvidia/nemotron-3-nano-30b-a3b:free";
  const agent = options.agent ?? process.env.OPENKAI_AGENT ?? "openkai";
  const cwd = process.cwd();
  const sessionsRoot = options.sessionsRoot ?? path.join(cwd, ".openkai", "sessions");

  const runMode = await resolveRunMode(options);

  const store = new SessionStore({ root: sessionsRoot, sessionId: options.session });
  await store.ensure();

  let replayMessages: AgentMessage[] = [];
  if (options.session) {
    try {
      replayMessages = await readSessionMessages(store.filePath);
    } catch (error) {
      if (!options.quiet) process.stderr.write(`[openkai] resume failed: ${error instanceof Error ? error.message : String(error)}\n`);
      return { code: 1, next: { kind: "quit" } };
    }
  }

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

  let transport: InProcessTransport;
  try {
    transport = new InProcessTransport({
      sessionId: store.sessionId,
      modelId,
      systemPrompt: options.systemPrompt,
      cwd,
      initialMessages: replayMessages,
      // Enable the permission gate so the TUI exposes write_file / edit_file /
      // bash behind an approval overlay (scope §4), and so `/undo` (§1.6) has a
      // shadow repo to restore. `openkai chat` leaves this unset (no approval
      // channel in print mode).
      enablePermissions: true,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      process.stderr.write(`${error.message}\n`);
      return { code: 1, next: { kind: "quit" } };
    }
    throw error;
  }

  const terminal = new ProcessTerminal();
  const tui = new TuiAltScreen(terminal, true);
  const manager = installKeymap();

  // P4b: focus-aware attention notifier (scope §1.1). DEC 1004 focus reporting
  // is enabled below so the notifier knows focus state.
  const notifier = new AttentionNotifier(terminal);

  // P4b: frecency history persisted under .openkai/history.json (scope §1.4).
  const history = new FrecencyHistory(path.join(cwd, ".openkai", "history.json"));
  await history.load();

  // Exit signalling: one promise, resolved once. No polling timers (an uncleared
  // interval would keep the event loop alive and hang the process on exit).
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
    agentName: agent,
    notifier,
    history,
    // `/undo` (scope §1.6): trust boundary is InProcessTransport (§2);
    // undoLastMutation() throws cleanly when the gate is off / nothing to undo.
    onUndo: () => transport.undoLastMutation(),
    onExit: requestExit,
  });
  const { root, composer, controller } = app;

  // Seed the composer's up-arrow recall with frecency-ranked prompts (§1.4).
  await controller.seedHistory();

  tui.setLayoutRoot(root);
  tui.setFocus(composer.editor);

  // ── Input listener: focus, palette, stash, density, clear, quit-confirm ──
  const escDetector = new DoubleEscDetector();
  let lastQuitConfirmAt = 0;

  tui.addInputListener((data) => {
    // DEC 1004 focus reporting (scope §1.1) — handle first so the OSC sequences
    // never reach the editor.
    if (isFocusIn(data)) {
      notifier.setFocused(true);
      controller.setFocused(true);
      return { consume: true };
    }
    if (isFocusOut(data)) {
      notifier.setFocused(false);
      controller.setFocused(false);
      return { consume: true };
    }
    // When an overlay (palette / permission) is open, it owns the input.
    if (tui.hasOverlay()) return undefined;
    // Any operator input clears the attention state (scope §1.1 — quiet once
    // the operator is back at the wheel).
    controller.clearAttention();

    if (isOpenPalette(data, manager)) {
      controller.openPalette();
      return { consume: true };
    }
    if (isStash(data, manager)) {
      controller.stashOrPop();
      return { consume: true };
    }
    if (isToggleThinking(data, manager)) {
      const revealed = controller.toggleThinking();
      tui.flash(revealed ? "thinking: shown" : "thinking: hidden");
      return { consume: true };
    }
    if (escDetector.feed(data)) {
      composer.clear();
      tui.flash("draft cleared");
      return { consume: true };
    }
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
  terminal.write(FOCUS_REPORT_ENABLE); // enable DEC 1004 focus reporting
  tui.start();

  if (!options.quiet) {
    process.stderr.write(`[openkai] tui ready · mode=${runMode.mode} · model=${modelId} · session=${store.sessionId.slice(0, 8)}\n`);
    if (runMode.mode === "local") {
      process.stderr.write(`[openkai] local mode — Cortex unreachable or unset; persisting locally only.\n`);
    }
  }

  const consumePromise = controller.consume();
  const next = await Promise.race([
    exitRequested,
    consumePromise.then((): ExitRequest => ({ kind: "quit" })).catch((): ExitRequest => ({ kind: "quit" })),
  ]);

  await controller.shutdown();
  await consumePromise.catch(() => undefined);

  tui.stop();
  terminal.write(FOCUS_REPORT_DISABLE); // leave the terminal clean
  await terminal.drainInput();
  return { code: 0, next };
}
