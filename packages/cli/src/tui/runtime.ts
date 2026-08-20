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
  Orchestrator,
  SessionStore,
  discoverMcpTools,
  fuse,
  listSessions,
  readSessionMessages,
  type CastConfig,
  type ToolSignal,
} from "@kaidera/openkai-core";
import { defaultModels } from "@kaidera/openkai-core";
import { readShiftConfig } from "../fuse.js";
import { sessionNameFromEntries } from "./session-search.js";
import { readToolApprovals } from "../config.js";
import type { RoutingEvent } from "@kaidera/openkai-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { buildTuiApp, type RunMode, type ExitRequest } from "./app.js";
import {
  installKeymap,
  isToggleThinking,
  isQuit,
  isOpenPalette,
  isStash,
  isHistorySearch,
  isChangelog,
  DoubleEscDetector,
  RewindEscDetector,
} from "./keymap.js";
import {
  AttentionNotifier,
  FOCUS_REPORT_ENABLE,
  FOCUS_REPORT_DISABLE,
  isFocusIn,
  isFocusOut,
} from "./attention.js";
import { isMouseShapedSequence } from "./mouse-guard.js";
import { installMouseRouting } from "./mouse-routing.js";
import { FrecencyHistory } from "./stash.js";
import { playBrandAnimation } from "./brand.js";
import { readConfig } from "./welcome.js";
import { detectThemeAsync, setTheme } from "./theme.js";
import { featureEnabled } from "./features.js";
import { appendActivity } from "../tail.js";
import { CLI_VERSION } from "../version.js";
import { configuredProviders, providerKeyStatus, resolveProvider } from "../providers.js";

/** Options for {@link runTui}. */
export interface RunTuiOptions {
  model?: string;
  provider?: string;
  session?: string;
  systemPrompt?: string;
  project?: string;
  api?: string;
  agent?: string;
  sessionsRoot?: string;
  quiet?: boolean;
  /** Composer prefill applied after boot (carried across restart exits). */
  prefill?: string;
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
  // First-run setup (E002 Inc 03): BEFORE provider/model resolution so the
  // operator's answers become this session's defaults. Skipped when explicit
  // flags are passed or when there's no TTY (e2e/pipes).
  // No boot-time wizard (CTO directive, restated 2026-08-19): the TUI
  // launches regardless of credential state and everything is configured
  // INSIDE — /setup, the settings panel, and the keyless-boot sign-in
  // overlay (setupNeeded in runSession) carry first-run setup. The old
  // readline welcome asked for API keys on every start whenever
  // config.onboarded was unset — exactly the blocking behaviour this removes.
  let session = options.session;
  let prefill = options.prefill;
  for (;;) {
    const { code, next } = await runSession({ ...options, session, ...(prefill !== undefined ? { prefill } : {}) });
    if (next.kind === "quit") return code;
    session = next.sessionId;
    prefill = next.prefill;
  }
}

/** Run one session to its exit request. */
async function runSession(options: RunTuiOptions): Promise<{ code: number; next: ExitRequest }> {
  const config = readConfig();
  let provider = resolveProvider(options.provider ?? (config.provider as string | undefined));
  // Fresh-install friendliness (0.1.6): when the resolved provider has no
  // credentials but another lane does — and no explicit --provider was
  // passed — prefer the configured lane. A box with one NVIDIA key boots
  // into NVIDIA, not a dead openrouter default. Only lanes with a real env
  // key count (`via` set): OAuth lanes report "configured" unconditionally,
  // and a keyless box must reach the sign-in overlay, not a mismatched lane.
  if (!options.provider && !providerKeyStatus(provider).configured) {
    const keyed = configuredProviders().filter((p) => providerKeyStatus(p).via !== undefined);
    if (keyed.length > 0 && !keyed.includes(provider)) {
      provider = keyed[0]!;
    }
  }
  // Model: flag > env > config > curated default > first catalogue entry for
  // the lane (a bootable default must exist for every provider — the
  // catalogue is bundled, so this never needs network).
  const catalogue = defaultModels();
  const modelId =
    options.model ??
    process.env.OPENKAI_MODEL ??
    (config.model as string | undefined) ??
    (provider === "openrouter" ? "nvidia/nemotron-3-nano-30b-a3b:free" : undefined) ??
    catalogue.getModels(provider)[0]?.id;
  if (!modelId) {
    process.stderr.write(
      `ERROR: no default model for provider "${provider}" — pass --model <id> (or set OPENKAI_MODEL).\n`,
    );
    return { code: 2, next: { kind: "quit" } };
  }
  const keyStatus = providerKeyStatus(provider);
  // 0.1.6 (CTO directive): missing credentials NEVER block the TUI. The shell
  // boots keyless (transport constructed with an injected catalogue, so no
  // pre-network key check), the sign-in overlay auto-opens, and OAuth/key
  // entry take effect on the next prompt — auth resolves per request.
  // Headless paths (chat/serve) keep their named exits.
  const setupNeeded = !keyStatus.configured;
  if (setupNeeded && !options.quiet) {
    process.stderr.write(
      `[openkai] no ${provider} credentials — the TUI will open sign-in; everything else works.\n`,
    );
  }
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
  // An empty replay list is not a replay — fresh sessions get the brand mark.
  const replay = replayMessages.length > 0 ? replayMessages : undefined;

  let checkpoint: CortexCheckpoint | undefined;
  if (runMode.mode === "managed" && runMode.cortex) {
    checkpoint = new CortexCheckpoint({
      client: runMode.cortex,
      agent,
      sessionId: store.sessionId,
      sourcePath: path.resolve(store.filePath),
      provider,
      modelId,
      cwd,
      task: "openkai tui",
    });
  }

  let transport: InProcessTransport;
  // The fusion lane shares the session's provider + model (self-pairing).
  const fusionModels = catalogue;
  const fusionModel = fusionModels.getModel(provider, modelId);
  if (!fusionModel) {
    process.stderr.write(`ERROR: model "${modelId}" not found under provider "${provider}".\n`);
    return { code: 2, next: { kind: "quit" } };
  }
  // E017 S1: routing events that arrive through the activity seam are ALSO
  // forwarded to the running controller (tier chip, transition notices).
  // Bound after buildTuiApp — the closure reads the current binding, so an
  // event can never race the app's construction.
  let routingToTui: ((event: RoutingEvent) => void) | undefined;
  // E017: the tier scorer's signal window (Switchyard's tool-result history).
  // Accumulated from the same activity stream; the last command text rides
  // along so bash writes count as production (K3).
  const signalWindow: ToolSignal[] = [];
  let lastBashCommand: string | undefined;
  let turnDepth = 0;
  let compacted = false;
  const sessionSignals = (): ToolSignal[] => [...signalWindow];
  try {
    transport = new InProcessTransport({
      sessionId: store.sessionId,
      modelId,
      provider,
      systemPrompt: options.systemPrompt,
      cwd,
      initialMessages: replayMessages,
      enablePermissions: true,
      // Injecting the catalogue skips the pre-network key check: a keyless
      // machine still boots (0.1.6); auth failures surface at stream time as
      // error events, and the sign-in overlay resolves them live.
      models: fusionModels,
      onActivity: (event) => {
        // Accumulate tier-scorer signals (E017) before anything else reads.
        if (event.kind === "tool_call") {
          turnDepth += 1;
          const args = "args" in event ? event.args : undefined;
          lastBashCommand =
            args !== null && typeof args === "object" && "command" in args && typeof args.command === "string"
              ? args.command
              : undefined;
        } else if (event.kind === "tool_result") {
          const result = "result" in event ? event.result : undefined;
          let resultText = "";
          if (result !== null && typeof result === "object" && "content" in result && Array.isArray(result.content)) {
            const texts: string[] = [];
            for (const part of result.content as unknown[]) {
              if (part !== null && typeof part === "object" && "text" in part && typeof part.text === "string") {
                texts.push(part.text);
              }
            }
            resultText = texts.join("\n").slice(0, 500);
          }
          signalWindow.push({
            tool: "toolName" in event && typeof event.toolName === "string" ? event.toolName : "?",
            resultText,
            ...(lastBashCommand !== undefined ? { command: lastBashCommand } : {}),
            ...(("isError" in event && event.isError === true) ? { isError: true } : {}),
          });
          lastBashCommand = undefined;
          if (signalWindow.length > 8) signalWindow.shift();
        }
        appendActivity(cwd, event.kind, {
          toolName: "toolName" in event ? (event.toolName as string) : undefined,
          args: "args" in event ? event.args : undefined,
          isError: "isError" in event ? (event.isError as boolean) : undefined,
          usage: "usage" in event ? (event.usage as { totalTokens?: number }) : undefined,
          // Routing fields (E017): shift/fusion decisions share this seam —
          // keep stage/tier/source/reason intact so `/shift` and
          // `openkai tail` show the rationale (OK-9.7 trust surface).
          stage: "stage" in event ? (event.stage as string) : undefined,
          model: "model" in event ? (event.model as string) : undefined,
          attempt: "attempt" in event ? (event.attempt as number) : undefined,
          tier: "tier" in event ? (event.tier as string) : undefined,
          source: "source" in event ? (event.source as string) : undefined,
          reason: "reason" in event ? (event.reason as string) : undefined,
        });
        // The tier chip + transition notices render live from the same stream.
        // The SessionEvent union is closed over session kinds; routing events
        // share this callback by convention, so widen to string before testing.
        const kind: string = event.kind;
        if (kind === "routing" || kind === "fallback" || kind === "routing_error") {
          routingToTui?.(event as unknown as RoutingEvent);
        }
      },
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      process.stderr.write(`${error.message}\n`);      return { code: 1, next: { kind: "quit" } };
    }
    throw error;
  }

  // E017 pick 7: the gate consults the persisted per-tool policy
  // (config.json tools.approval.<tool>) live — after the deny floor, before
  // the autonomy axis — so the overlay's "always (this project)" stop and
  // hand-edited keys apply without a restart.
  transport.gate?.setToolPolicySource(() => readToolApprovals());

  // Discover MCP tools AFTER construction so the proxies execute under the
  // transport's permission gate (E010), then merge them into the gated set —
  // the transport merges extras, never replaces its own tools.
  const mcpTools = await discoverMcpTools(transport.gate);
  if (mcpTools.length > 0) transport.addExtraTools(mcpTools);

  // E017: the session orchestrator (shift in-session). Posture/pins come
  // from the pinned config.shift shape; the cast config is the same surface
  // fusion uses. Events append to the ledger AND light the tier chip.
  const shiftConfig = readShiftConfig(config);
  // config doubles as the cast config surface (casts/defaultCast keys) —
  // narrow explicitly at the boundary rather than trusting the loose record.
  const castConfig: CastConfig = {
    ...(Array.isArray(config.casts) ? { casts: config.casts as CastConfig["casts"] } : {}),
    ...(typeof config.defaultCast === "string" ? { defaultCast: config.defaultCast } : {}),
  };
  const orchestrator = new Orchestrator({
    cwd,
    castConfig,
    ...(shiftConfig.posture !== undefined ? { posture: shiftConfig.posture } : {}),
    ...(shiftConfig.pins !== undefined ? { pins: shiftConfig.pins } : {}),
    onActivity: (event) => {
      appendActivity(cwd, event.kind, {
        stage: event.stage,
        model: event.model,
        provider: event.provider,
        attempt: event.attempt,
        tier: event.tier,
        source: event.source,
        reason: event.reason,
      });
      routingToTui?.(event);
    },
  });

  // Theme (E008): explicit choice wins; otherwise auto-detect the terminal's
  // background (OSC 11 → COLORFGBG → dark) before the alt screen takes over.
  const themeChoice = (readConfig().theme as string | undefined) ?? "auto";
  if (themeChoice === "auto") {
    const detected = await detectThemeAsync();
    setTheme(detected);
  } else {
    setTheme(themeChoice);
  }

  const terminal = new ProcessTerminal();
  // First-run brand moment: animated Kaidera mark + OpenKai wordmark with the
  // shine traversal (omp choreography, any key skips, TTY only), before the
  // alt-screen app takes over. DROPPED in the mouse-feature edit (b50232d)
  // and restored here — the feature registry exists to catch exactly this.
  await playBrandAnimation(CLI_VERSION);
  const tui = new TuiAltScreen(terminal, true, undefined, {
    // Claude Code-style mouse (E012): wheel scrolls the transcript, drag
    // selects (copied to the clipboard), scrollbar drags, and OSC 8 URLs open
    // on click. Feature-gated; the bash tool never inherits the TUI stdin so
    // subprocesses can't flood SGR coordinates.
    mouse: featureEnabled("mouse"),
    wheelScrollLines: 3,
    openUrl: (url) => {
      void import("node:child_process").then(({ execFile }) => {
        const opener = process.platform === "darwin" ? "open" : "xdg-open";
        execFile(opener, [url], () => undefined);
      });
    },
  });
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
    replayMessages: replay,
    sessionsRoot,
    agentName: agent,
    notifier,
    history,
    provider,
    setupNeeded,
    cwd,
    onBeforePrompt: (text) => {
      // E017 composition in-session: decide the tier from accumulated tool
      // signals. Evidence-only — with no signals or a below-threshold
      // fall_open the operator's chosen model stands.
      if (!featureEnabled("shift")) return;
      const signals = sessionSignals();
      if (signals.length === 0) return;
      const decision = orchestrator.decide({ prompt: text }, { signals, turnDepth, compacted });
      if (decision.source === "fall_open") return;
      const model = catalogue.getModel(decision.provider, decision.model);
      if (model && model.id !== transport.modelId) transport.setModel(model);
    },
    onAutoCompact: () => {
      if (!featureEnabled("shift")) return;
      compacted = true;
      const decision = orchestrator.reevaluate({ signals: sessionSignals(), turnDepth, compacted });
      if (!decision) return;
      const model = catalogue.getModel(decision.provider, decision.model);
      if (model && model.id !== transport.modelId) transport.setModel(model);
    },
    onSetModel: (model) => transport.setModel(model),
    onSetEffort: {
      set: (level) => transport.setThinkingLevel(level),
      current: () => transport.thinkingLevel,
    },
    onSetAutonomy: {
      set: (level) => transport.setAutonomy(level),
      current: () => transport.autonomyLevel,
    },
    // `/fuse` (OK-7): run the panel on the session's provider; the picker's
    // fusion partner becomes the builder when set (cross-provider duet),
    // otherwise self-pairing (E016's replicated first step).
    runFusion: (task) => {
      const architectPick = app.controller.fusionArchitect;
      const architect = architectPick
        ? fusionModels.getModel(architectPick.provider, architectPick.modelId) ?? fusionModel
        : fusionModel;
      const partner = app.controller.fusionPartner;
      const builder = partner
        ? fusionModels.getModel(partner.provider, partner.modelId) ?? architect
        : architect;
      return fuse(
        (m, ctx, opts) => defaultModels().streamSimple(m, ctx, opts),
        {
          task,
          architectModel: architect,
          builderModel: builder,
        },
      );
    },
    // `/undo` (scope §1.6): trust boundary is InProcessTransport (§2);
    // undoLastMutation() throws cleanly when the gate is off / nothing to undo.
    onUndo: () => transport.undoLastMutation(),
    onExit: requestExit,
  });
  const { root, composer, controller } = app;
  // A restart exit can carry composer prefill (e.g. the fork picker's picked
  // user text) — restore it so the text survives the session rebuild.
  if (options.prefill) composer.prefill(options.prefill);
  // Restore the session's display name into the top header bar (/rename).
  controller.setSessionName(sessionNameFromEntries(await store.readEntries()));
  // Bind the routing forwarder (declared before the transport so the activity
  // seam could reference it): facade/shift events now reach the chrome live.
  routingToTui = (event) => controller.applyRoutingEvent(event);

  // Seed the composer's up-arrow recall with frecency-ranked prompts (§1.4).
  await controller.seedHistory();

  tui.setLayoutRoot(root);
  tui.setFocus(composer.editor);

  // Click-to-cursor (E019 inc 03): Claude Code's grammar — click inside the
  // composer moves the text cursor there; drag still selects. Wraps the alt
  // screen's viewport input; feature-gated with the rest of the mouse work.
  if (featureEnabled("mouse")) {
    installMouseRouting(
      tui,
      {
        geometry: () => composer.composerGeometry(),
        positionCursorAt: (row, col) => composer.positionCursorAt(row, col),
      },
      () => terminal.columns > 0 && terminal.rows > 0 ? terminal.rows : 24,
    );
  }

  // ── Input listener: focus, palette, stash, density, clear, quit-confirm ──
  const escDetector = new DoubleEscDetector();
  const rewindDetector = new RewindEscDetector();
  let lastQuitConfirmAt = 0;

  tui.addInputListener((data) => {
    // Mouse guard (E019 inc 02): any mouse-shaped sequence pi-tui's viewport
    // listener did NOT consume is swallowed here — it must never reach the
    // editor as literal digits, whatever encoding the terminal fell back to.
    if (isMouseShapedSequence(data)) {
      return { consume: true };
    }
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
    // Bash mode (droid's `!`): only at an empty draft, so `!` mid-text types.
    if (data === "!" && composer.text.trim() === "") {
      controller.toggleBash();
      return { consume: true };
    }
    if (isStash(data, manager)) {
      controller.stashOrPop();
      return { consume: true };
    }
    if (isHistorySearch(data, manager)) {
      controller.openHistorySearch();
      return { consume: true };
    }
    if (isToggleThinking(data, manager)) {
      const revealed = controller.toggleThinking();
      tui.flash(revealed ? "thinking: shown" : "thinking: hidden");
      return { consume: true };
    }
    if (isChangelog(data, manager)) {
      controller.openChangelog();
      return { consume: true };
    }
    // Esc grammar (scope §3.5 + droid's panic key): feed BOTH detectors
    // before either consumes — the double fires at the 2nd Esc (clear draft),
    // and a 3rd inside the rewind window still completes the triple. Triple
    // is checked first so it wins when it completes.
    const escPresses = rewindDetector.feed(data);
    if (escPresses === "triple") {
      controller.openRewind();
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

  // Crash guard (CTO report 2026-08-19): an uncaught error inside the
  // alt-screen app used to kill the process WITHOUT restoring the terminal —
  // the operator had to kill the window. Restore, report, exit clean.
  // Removed on the normal teardown path below.
  const onFatal = (error: unknown): void => {
    try {
      tui.stop();
    } catch {
      // best effort — the terminal must not stay wedged
    }
    try {
      terminal.write(FOCUS_REPORT_DISABLE);
    } catch {
      // best effort
    }
    try {
      process.stderr.write(
        `\nopenkai crashed (terminal restored): ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    } catch {
      // stderr may be destroyed (EPIPE) — the terminal is already restored
    }
    process.exit(1);
  };
  process.once("uncaughtException", onFatal);
  process.once("unhandledRejection", onFatal);

  if (!options.quiet) {
    process.stderr.write(`[openkai] tui ready · mode=${runMode.mode} · model=${modelId} · session=${store.sessionId.slice(0, 8)}\n`);
    if (runMode.mode === "local") {
      process.stderr.write(`[openkai] local mode — Cortex unreachable or unset; persisting locally only.\n`);
    }
  }

  try {
    // 0.1.6 keyless boot: no credentials → open sign-in inside the running
    // shell (the CTO directive: configure after launch, never block boot).
    if (setupNeeded) {
      controller.beginProviderSetup(provider);
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
  } finally {
    // The guard stays live through tui.stop()/drainInput — exactly the
    // window it was built for — and is always removed on exit.
    process.off("uncaughtException", onFatal);
    process.off("unhandledRejection", onFatal);
  }
}
