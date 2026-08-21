/**
 * TUI app + controller (scope §4 `app.ts`).
 *
 * Builds the layout root — `VStack([ScrollView(transcript), composer.editor,
 * status])` — and the {@link TuiController} that wires the P2
 * {@link SessionTransport} event stream to the transcript + status chrome.
 * The same transport drives the loop; the TUI is the second renderer
 * (scope §1: "same transport, second renderer — do not fork the loop").
 *
 * P4b (scope §1) wires six TUI-surface features into the controller:
 *  - attention notifications (§1.1) — turn_end / permission_request light the
 *    amber chrome state + fire a focus-gated bell/OSC via {@link AttentionNotifier}.
 *  - per-agent identity (§1.2) — the assistant header is a coloured pill.
 *  - leader-key command palette (§1.3) — {@link CommandPalette} overlay.
 *  - prompt stash + frecency history (§1.4) — {@link PromptStash} +
 *    {@link FrecencyHistory}, ranked by the pure {@link rankFrecency}.
 *  - `/btw` side channel (§1.5) — answer renders as a system-marked block.
 *  - `/undo` surface (§1.6) — over `transport.undoLastMutation()`.
 *
 * E017 S1 (OK-9.7 trust surface — research/2026-08-18-shift-fusion-orchestration-ADR.md):
 * routing becomes SEEABLE. Tier-aware {@link RoutingEvent}s drive the status
 * line's `t:` chip (with a transition flash on flips); fusion runs render
 * role-pilled blocks and structured gate verdicts; `/shift` renders the
 * session routing ledger from `.openkai/activity.jsonl`; `/diff` opens the
 * shadow-snapshot diff overlay.
 */

import { ScrollView, Text, VStack } from "@earendil-works/pi-tui";
import type { Component, TUI, StackChild } from "@earendil-works/pi-tui";
import { highlight, text as textToken } from "./theme.js";
import {
  CortexCheckpoint,
  SessionStore,
  ShadowGit,
  redactSecrets,
  sessionTree,
  type FuseResult,
  type InProcessTransport,
  type PermissionPreview,
  type RoutingEvent,
  type SessionEvent,
  type SessionTransport,
  type UsageSnapshot,
} from "@kaidera/openkai-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { defaultModels } from "@kaidera/openkai-core";
import { readShiftConfig } from "../fuse.js";
import { PROVIDERS, providerKeyStatus, suggestFusionPartner, configuredProviders } from "../providers.js";
import { DEFAULT_STATUSLINE_CHIPS, readStatuslineChips, writeStatuslineChips, readConfigFile, writeConfigFile, writeShiftPosture, type StatuslineChip } from "../config.js";
import { initAgentsMd } from "../init.js";
import { appendLearning, initMemory, memoryStatus } from "../memory.js";
import { getGoal, setGoal, updateGoal, clearGoal } from "../goal.js";

/** Status line presets (mirror of settings.ts — the live chip sets). */
const STATUSLINE_PRESET_CHIPS: Record<string, StatuslineChip[]> = {
  default: [...DEFAULT_STATUSLINE_CHIPS],
  minimal: ["brand", "state", "model"],
  compact: ["brand", "provider", "state", "tokens", "model"],
  full: ["brand", "agent", "provider", "git", "persist", "session", "state", "ctx", "tokens", "model"],
};
import { ModelPicker } from "./model-picker.js";
import { LevelPicker } from "./level-picker.js";
import { HistorySearch } from "./history-search.js";
import { ForkPicker, type ForkPoint } from "./fork-picker.js";
import { SessionSearchPicker, readSessionSearchRows, sessionNameFromEntries } from "./session-search.js";
import { exportSessionToHtml } from "./export-html.js";
import { ModelsHub } from "./models-hub.js";
import { SettingsOverlay } from "./settings.js";
import { readConfig } from "./welcome.js";
import { helpIndex, helpTopic } from "../help.js";
import { FEATURES, featureEnabled, setFeature } from "./features.js";
import { setTheme, themeName, themeNames, detectThemeAsync, detectThemeSync } from "./theme.js";
import { ThemePicker } from "./theme-picker.js";
import { changelogHead } from "./changelog.js";
import { DiffOverlay } from "./diff.js";
import { activityLogPath } from "../tail.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** Count installed skills (.agents/skills/, excluding the manifest). */
function countSkills(): number {
  try {
    return readdirSync(path.join(process.cwd(), ".agents", "skills"), { withFileTypes: true })
      .filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/** Count configured MCP servers (~/.openkai/config.json mcpServers map). */
function countMcpServers(): number {
  try {
    const config = readConfig();
    const servers = config["mcpServers"];
    return servers && typeof servers === "object" ? Object.keys(servers).length : 0;
  } catch {
    return 0;
  }
}
import { tipOfTheDay } from "./tips.js";
import { Transcript } from "./transcript.js";
import { sanitizeTerminalText } from "./sanitize.js";
import {
  detectMagicKeywords,
  ULTRAREVIEW_NOTICE,
  ULTRATHINK_NOTICE,
  type MagicKeyword,
} from "./magic-keywords.js";
import { Composer } from "./composer.js";
import { StatusLine, defaultStatusState } from "./status.js";
import { parseSlashCommand, helpText, buildPaletteItems } from "./commands.js";
import { PermissionOverlay, type PermissionDecision } from "./permission.js";
import { SignInOverlay } from "./signin.js";
import { OAuthOverlay } from "./oauth.js";
import { CommandPalette, type PaletteItem } from "./palette.js";
import { PromptStash, FrecencyHistory } from "./stash.js";
import { bootMark, capabilityRow, compactMark } from "./brand.js";
import { CLI_VERSION } from "../version.js";
import type { AttentionNotifier } from "./attention.js";

/** Run mode resolved at startup (A1). */
export type RunMode = "local" | "managed";

/** What the app is asking the runtime to do next. */
export type ExitRequest =
  | { kind: "quit" }
  | { kind: "restart"; sessionId?: string; prefill?: string };

/** Options shared by both entry points. */
export interface TuiAppOptions {
  transport: SessionTransport;
  modelId: string;
  sessionId: string;
  persistMode: string;
  store: SessionStore;
  checkpoint?: CortexCheckpoint;
  replayMessages?: AgentMessage[];
  sessionsRoot?: string;
  onExit?: (request: ExitRequest) => void;
  /**
   * 0.1.6 keyless boot: the provider has no credentials — the shell boots
   * anyway and the sign-in overlay auto-opens after boot (CTO directive:
   * never block the TUI on a missing key).
   */
  setupNeeded?: boolean;
  /** E017: called in submit() before the turn starts — the orchestrator's tier decision point. */
  onBeforePrompt?: (text: string) => void;
  /** E017: called after an auto-compact — the free tier-switch boundary (Devin pattern). */
  onAutoCompact?: () => void;
  // ── P4b (scope §1) ─────────────────────────────────────────────────────
  /** Agent name for the identity pill + chrome (scope §1.2; default `openkai`). */
  agentName?: string;
  /** Focus-aware notifier (scope §1.1); omitted ⇒ attention chrome only, no bell. */
  notifier?: AttentionNotifier;
  /** Prompt stash (scope §1.4); a fresh stack when omitted. */
  stash?: PromptStash;
  /** Frecency history store (scope §1.4); omitted ⇒ no persistence/recall seeding. */
  history?: FrecencyHistory;
  /** `/undo` callback (scope §1.6) — restores the last gated mutation, returns sha. */
  onUndo?: () => Promise<string>;
  /** `/fuse` callback (OK-7) — runs the fusion panel + synthesis for a task. */
  runFusion?: (task: string) => Promise<FuseResult>;
  /** Active provider id (for the model picker's current marker). */
  provider?: string;
  /** `/model` callback — switch the session model mid-run. */
  onSetModel?: (model: Model<Api>) => void;
  /** `/effort` + `/fast` callbacks — reasoning effort control. */
  onSetEffort?: {
    set: (level: "off" | "minimal" | "low" | "medium" | "high") => void;
    current: () => string;
  };
  /** `/autonomy` callback — the coarse permission axis. */
  onSetAutonomy?: {
    set: (level: "off" | "low" | "med" | "high") => void;
    current: () => string;
  };
  /**
   * Project root for the `/shift` ledger (`.openkai/activity.jsonl`) and the
   * `/diff` shadow repo. Defaults to process.cwd(); injectable for tests.
   */
  cwd?: string;
}

/** The built TUI app handle. */
export interface TuiApp {
  root: Component;
  transcript: Transcript;
  composer: Composer;
  status: StatusLine;
  controller: TuiController;
}

/** Build the TUI layout + controller against a `TUI`. */
export function buildTuiApp(tui: TUI, options: TuiAppOptions): TuiApp {
  const agentName = options.agentName ?? "openkai";
  const transcript = new Transcript(agentName);
  if (options.replayMessages) {
    for (const msg of options.replayMessages) {
      if (!("role" in msg)) continue;
      const role = (msg as { role: string }).role;
      const text = messageText(msg);
      if (role === "user") transcript.addUserMessage(text);
      else if (role === "assistant") transcript.replayAssistant(text);
    }
  } else {
    // Brand fixture: the gradient hex mark + wordmark at the top of every
    // fresh transcript (droid's boot card; the animation is the moment,
    // this is the fixture). State is user-global, ~/.openkai/state.json.
    transcript.addNotice(bootMark(CLI_VERSION), { boot: true });
    // The capability row (droid's boot pattern): what this setup actually has.
    transcript.addNotice(
      capabilityRow({
        configuredProviders: configuredProviders().length,
        skills: countSkills(),
        mcpServers: countMcpServers(),
        agentsMdPresent: existsSync(path.join(process.cwd(), "AGENTS.md")),
      }),
      { boot: true },
    );
    // The daily tip (disable via /features tips) — teaching, not noise.
    if (featureEnabled("tips")) {
      transcript.addNotice(tipOfTheDay(), { boot: true });
    }
    // Project memory (E003): surface the shared learnings when they exist so
    // every session in this folder sees what the others learned.
    const memory = memoryStatus(process.cwd());
    if (memory.initialized && memory.learnings > 0) {
      transcript.addNotice(
        `memory: ${memory.learnings} shared learning(s)${memory.agents.length > 0 ? ` across ${memory.agents.length} agent(s)` : ""} — /memory to view, /memory add to record`,
        { boot: true },
      );
    }
    // Session goal (E006): keep the guiding objective visible on every boot.
    const goal = getGoal();
    if (goal && goal.status === "active") {
      transcript.addNotice(`goal: ${goal.text} — /goal to manage`);
    }
  }
  const statusState = defaultStatusState(options.modelId, options.sessionId, options.persistMode);
  statusState.agentName = agentName;
  statusState.provider = options.provider ?? "";
  // omp's footer segment: the current git branch (empty when not a repo).
  try {
    statusState.gitBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    })
      .toString()
      .trim();
  } catch {
    statusState.gitBranch = "";
  }
  const status = new StatusLine(statusState);

  const controller = new TuiController(tui, options, transcript, status);
  const composer = new Composer(tui, {
    onSubmit: (text) => {
      const command = parseSlashCommand(text);
      if (command) {
        controller.guard(controller.dispatchCommand(command.name, command.argument), `/${command.name}`);
        return;
      }
      // Magic keywords (ultrathink/ultrareview): multi-model ultra turns —
      // the fusion panel combines the models' efforts. Bash mode and busy
      // steering keep the plain submit semantics.
      const keywords = detectMagicKeywords(text);
      if (keywords.length > 0) {
        controller.guard(controller.runUltraTurn(text, keywords), "ultra");
        return;
      }
      controller.guard(controller.submit(text), "submit");
    },
  });
  controller.attachComposer(composer);

  const scroll = new ScrollView(transcript, { follow: "end", primary: true, scrollbar: "auto" });
  // Session-name line (Claude Code's /rename chrome): the line directly
  // above the chat input bar — not a window-top header. Unnamed sessions get
  // a dim short id so the line never reflows; /rename swaps the text live.
  const header = new Text("", 1, 0);
  controller.attachHeader(header);

  const root = new VStack(
    [
      { component: scroll, grow: 1 },
      { component: header, basis: 1, shrink: 0, minSize: 1 },
      { component: composer.editor, basis: "auto", shrink: 0 },
      { component: status, basis: 1, shrink: 0, minSize: 1 },
    ] as StackChild[],
    { gap: 0, align: "stretch" },
  );
  return { root, transcript, composer, status, controller };
}

/** Compact token counts for the settled row (12.4k / 1,892 style). */
function formatTokens(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`.replace(/\.0k$/, "k");
  return String(value);
}

/** Pull the human denial reason out of a denied tool result's text. */
function denyReasonFromResult(event: SessionEvent): string {
  const result = (event as { result?: { content?: unknown } }).result;
  const content = result?.content;
  if (Array.isArray(content)) {
    const text = content
      .filter((p): p is { type: "text"; text: string } => typeof p === "object" && p !== null && "text" in p)
      .map((p) => p.text)
      .join(" ");
    const match = /Permission denied:\s*(.+)$/s.exec(text);
    // Flatten newlines: the notice renders each line with a danger border, so
    // an unflattened newline in the model's denial text would forge a second
    // bordered "adjust:" line indistinguishable from OpenKai's own chrome
    // (E019 area 5). ANSI/BEL is stripped downstream by addError's sanitiser.
    if (match) return match[1]!.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  }
  return "refused at the permission gate";
}

/**
 * Extract text from a stored AgentMessage for replay DISPLAY, redacted.
 *
 * SECURITY (E002-F1d3, third consumer) — `/resume` and `openkai chat --resume`
 * render a stored transcript through this seam (see {@link buildTuiApp}). Like
 * `openkai tail` (F1d) and `openkai sessions` (F1d2), the file outlives any one
 * version: a turn written before the redactor covered a provider still holds
 * that key in cleartext, so redact on READ here too. This is the display path
 * only — the raw messages still seed the model context via `initialMessages`
 * (runtime.ts), which must NOT be redacted or the resumed conversation loses
 * its history. Redaction lives in the helper so a future replay caller cannot
 * bypass it.
 */
export function messageText(msg: AgentMessage): string {
  if (!("content" in msg)) return "";
  const content = (msg as { content: unknown }).content;
  let raw = "";
  if (typeof content === "string") {
    raw = content;
  } else if (Array.isArray(content)) {
    raw = content
      .filter((p): p is { type: "text"; text: string } => typeof p === "object" && p !== null && "type" in p && p.type === "text")
      .map((p) => p.text)
      .join("");
  }
  return redactSecrets(raw);
}

/** Controller — bridges the transport event stream to the transcript + chrome. */
export class TuiController {
  private readonly tui: TUI;
  private readonly transport: SessionTransport;
  private readonly store: SessionStore;
  private readonly checkpoint?: CortexCheckpoint;
  private readonly transcript: Transcript;
  /** The picker's fusion partner (builder model for /fuse), or undefined for self-pairing. */
  fusionPartner?: { provider: string; modelId: string };
  /** Fusion architect (model 1) when explicitly configured via /fuse's pair picker; undefined = the session model (default). */
  fusionArchitect?: { provider: string; modelId: string };
  /** Recently used models (provider/id), most recent first — the hub's recent scope. */
  private recentModels: string[] = [];
  private readonly status: StatusLine;
  private readonly sessionId: string;
  private readonly sessionsRoot?: string;
  private readonly onExit?: (request: ExitRequest) => void;
  private readonly notifier?: AttentionNotifier;
  private readonly stash: PromptStash;
  private readonly history?: FrecencyHistory;
  private readonly onUndo?: () => Promise<string>;
  private readonly runFusion?: (task: string) => Promise<FuseResult>;
  private readonly onBeforePrompt?: (text: string) => void;
  private readonly onAutoCompact?: () => void;
  /** Project root (the `/shift` ledger + `/diff` shadow repo root). */
  private readonly cwd: string;
  private provider?: string;
  private modelId: string;
  private modelSwitch?: (model: Model<Api>) => void;
  private effortSwitch?: { set: (level: "off" | "minimal" | "low" | "medium" | "high") => void; current: () => string };
  private autonomySwitch?: { set: (level: "off" | "low" | "med" | "high") => void; current: () => string };
  private lastPrompt?: string;
  private composer?: Composer;
  /** Droid's `!` bash mode: submissions run through the gated bash tool. */
  bashMode = false;
  // Plan mode (E010) has NO field here — the transport is the single source
  // of truth (`transport.planMode`); caching it in the controller drifted.
  private busy = false;
  private done = false;
  /** True while the current turn is a `/btw` side channel (scope §1.5) — persistTurn skips it so the ephemeral exchange never re-persists the prior assistant block. */
  private btwTurn = false;
  /** Elapsed ms captured when the `error` event landed (null = turn clean). Consumed at `turn_end` so the settle row reports the failure — with the real elapsed, since the error path already reset busySince (E019 S1). */
  private turnErrorElapsedMs: number | null = null;

  constructor(tui: TUI, options: TuiAppOptions, transcript: Transcript, status: StatusLine) {
    this.tui = tui;
    this.transport = options.transport;
    this.store = options.store;
    this.checkpoint = options.checkpoint;
    this.transcript = transcript;
    this.status = status;
    this.modelId = options.modelId;
    this.sessionId = options.sessionId;
    this.sessionsRoot = options.sessionsRoot;
    this.onExit = options.onExit;
    this.notifier = options.notifier;
    this.stash = options.stash ?? new PromptStash();
    this.history = options.history;
    this.onUndo = options.onUndo;
    this.runFusion = options.runFusion;
    this.onBeforePrompt = options.onBeforePrompt;
    this.onAutoCompact = options.onAutoCompact;
    this.cwd = options.cwd ?? process.cwd();
    this.provider = options.provider;
    this.modelSwitch = options.onSetModel;
    this.effortSwitch = options.onSetEffort;
    this.autonomySwitch = options.onSetAutonomy;
  }

  /** Attach the composer (set after construction so the controller can build it). */
  attachComposer(composer: Composer): void {
    this.composer = composer;
  }

  /**
   * Run an async controller action, surfacing a rejection as a transcript
   * notice — composer/palette dispatches must never end as unhandled
   * rejections.
   */
  guard(action: Promise<void>, label: string): void {
    void action.catch((error: unknown) => {
      this.transcript.addError(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      this.tui.requestRender();
    });
  }

  /** Execute a slash command (scope §4). Output is a local notice — never sent to the model. */
  async dispatchCommand(name: string, argument: string): Promise<void> {
    switch (name) {
      case "help":
        if (argument.length > 0) {
          const topic = helpTopic(argument);
          this.transcript.addNotice(
            topic ? [`${topic.title}:`, ...topic.lines, "", `see also: ${topic.seeAlso.join(", ")}`] : helpIndex(),
          );
        } else {
          this.transcript.addNotice(helpText());
        }
        break;
      case "features": {
        const lines = FEATURES.map((f) => {
          const on = featureEnabled(f.key);
          return `  ${on ? "●" : "○"} ${f.label.padEnd(24)} ${on ? "on" : "off"}  — ${f.description}`;
        });
        if (argument.length === 0) {
          this.transcript.addNotice(["features (/features <key> toggles):", ...lines]);
        } else {
          const def = FEATURES.find((f) => f.key === argument);
          if (!def) {
            this.transcript.addNotice(`unknown feature "${argument}" — keys: ${FEATURES.map((f) => f.key).join(", ")}`);
          } else {
            const next = !featureEnabled(def.key);
            setFeature(def.key, next);
            this.transcript.addNotice(`${def.label}: ${next ? "on" : "off"}`);
          }
        }
        break;
      }
      case "effort":
        this.cycleEffort(argument);
        break;
      case "fast":
        this.toggleFast();
        break;
      case "sessions": {
        const root = this.sessionsRoot ?? path.join(this.cwd, ".openkai", "sessions");
        const rows = await readSessionSearchRows(root, { withText: false });
        this.transcript.addNotice(
          rows.length === 0
            ? "sessions: none yet"
            : [
                "sessions:",
                ...rows.map(
                  (row) =>
                    `  ${row.name ? `${row.name} (${row.id.slice(0, 8)})` : row.id} · ${row.messageCount} msgs${row.id === this.sessionId ? "  (current)" : ""}`,
                ),
              ],
        );
        break;
      }
      case "new":
        this.transcript.addNotice("starting a fresh session…");
        this.onExit?.({ kind: "restart" });
        break;
      case "resume":
        if (argument.length === 0) {
          await this.openSessionSearch();
          break;
        }
        this.transcript.addNotice(`resuming ${argument}…`);
        this.onExit?.({ kind: "restart", sessionId: argument });
        break;
      case "model":
        if (argument.length > 0) {
          this.applyModelSelection(this.provider ?? "openrouter", argument);
        } else {
          this.openModelPicker();
        }
        break;
      case "models":
        this.openModelsHub();
        break;
      case "btw":
        if (argument.length === 0) {
          this.transcript.addNotice("btw: needs a side question — /btw <text>");
          break;
        }
        await this.btw(argument);
        break;
      case "fuse":
        if (argument.length > 0) {
          await this.fuse(argument);
        } else {
          this.openFuseMenu();
        }
        break;
      case "retry":
        await this.retry(argument);
        break;
      case "settings":
        this.openSettings();
        break;
      case "plan": {
        // Cline's Plan mode (E010): the transport owns the flag — the TUI
        // reads it for the chip + auto-reject, never caches it.
        const on = !this.transport.planMode;
        this.transport.setPlanMode(on);
        if (on) this.rejectOpenPermission();
        this.status.update({ ...this.status.currentState, plan: this.transport.planMode });
        this.transcript.addNotice(
          this.transport.planMode
            ? "plan mode ON — read-only; write_file/edit_file/bash are refused at the gate"
            : "plan mode OFF — mutations ask for approval as usual",
        );
        this.tui.requestRender();
        break;
      }
      case "fork":
        await this.openForkPicker();
        break;
      case "tree": {
        const rows = await sessionTree(this.sessionsRoot);
        if (rows.length === 0) {
          this.transcript.addNotice("tree: no sessions yet");
          break;
        }
        const lines = rows.map((r) => {
          const depth = r.parentSessionId ? "  ⤷ " : "";
          const current = r.sessionId === this.sessionId ? "  (current)" : "";
          return `${depth}${r.sessionId.slice(0, 8)} · ${r.messages} msgs${current}`;
        });
        this.transcript.addNotice(["session tree:", ...lines]);
        break;
      }
      case "rename":
      case "name": {
        // Session display name (/rename; /name kept as an alias): persisted
        // as a `session_name` custom entry (the append-only analogue of pi's
        // session_info entry); shown in the top header bar (Claude Code
        // style), /sessions, the /resume picker, and /export.
        const name = argument.trim();
        if (!name) {
          const current = this.sessionName ?? sessionNameFromEntries(await this.store.readEntries());
          this.transcript.addNotice(current ? `/rename — this session is "${current}"` : "/rename — no name set; usage: /rename <display-name>");
          break;
        }
        await this.store.appendCustom("session_name", { name });
        this.setSessionName(name);
        this.transcript.addNotice(`/rename — session named "${name}" (top bar · /sessions · /resume search)`);
        break;
      }
      case "export": {
        // /export [path] (E017 pick 8): a self-contained HTML transcript of
        // this session (inline CSS, theme colours). A .jsonl suffix dumps
        // the raw session file instead (pi's convention).
        const entries = await this.store.readEntries();
        let target = argument.trim();
        if (target.length === 0) {
          target = path.join(this.cwd, `openkai-session-${this.sessionId.slice(0, 8)}.html`);
        }
        try {
          if (target.endsWith(".jsonl")) {
            await fsp.copyFile(this.store.filePath, target);
          } else {
            const html = exportSessionToHtml({
              sessionId: this.sessionId,
              name: sessionNameFromEntries(entries),
              entries,
            });
            await fsp.writeFile(target, html, "utf-8");
          }
          this.transcript.addNotice(`/export — session exported to: ${target}`);
        } catch (error) {
          this.transcript.addError(`/export — failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;
      }
      case "autonomy":
        this.openAutonomyPicker(argument);
        break;
      case "setup":
        this.openSetup();
        break;
      case "init": {
        const result = initAgentsMd(process.cwd());
        this.transcript.addNotice(`/init — ${result.message}`);
        this.tui.requestRender();
        break;
      }
      case "memory": {
        const text = argument.trim();
        if (text.startsWith("add ")) {
          appendLearning(process.cwd(), this.status.currentState.agentName, this.sessionId, text.slice(4));
          this.transcript.addNotice(`/memory — learning recorded ✓ (shared with every agent in this project)`);
        } else {
          const status = memoryStatus(process.cwd());
          if (!status.initialized) {
            initMemory(process.cwd());
            this.transcript.addNotice([
              `/memory — created .openkai/memory/ (learnings.md · agents/ · README.md)`,
              `append-only + agent/session-tagged: safe across concurrent sessions in this folder`,
            ]);
          } else {
            this.transcript.addNotice([
              `/memory — ${status.learnings} learning(s) · ${status.agents.length} agent(s)${status.agents.length > 0 ? ` (${status.agents.join(", ")})` : ""}`,
              ...(status.recent.length > 0 ? ["recent:", ...status.recent.map((r) => `  ${r}`)] : []),
              `add one: /memory add <what you learned>`,
            ]);
          }
        }
        this.tui.requestRender();
        break;
      }
      case "goal": {
        const arg = argument.trim();
        const verb = arg.split(/\s+/)[0] ?? "";
        if (["show", "pause", "resume", "drop", "done"].includes(verb) || arg === "") {
          const goal = getGoal();
          if (arg === "" || verb === "show") {
            this.transcript.addNotice(
              goal
                ? [`/goal — [${goal.status}] ${goal.text}`, `set: ${goal.createdAt.slice(0, 10)} · updated: ${goal.updatedAt.slice(0, 10)}`, `verbs: /goal pause · /goal resume · /goal done · /goal drop`]
                : ["/goal — no goal set", "set one: /goal <what you're working towards>"],
            );
          } else if (verb === "drop") {
            clearGoal();
            this.transcript.addNotice("/goal — dropped");
          } else if (verb === "pause") {
            this.transcript.addNotice(updateGoal("paused") ? "/goal — paused" : "/goal — no goal to pause");
          } else if (verb === "resume") {
            this.transcript.addNotice(updateGoal("active") ? "/goal — resumed" : "/goal — no goal to resume");
          } else {
            this.transcript.addNotice(updateGoal("done") ? "/goal — marked done ✓" : "/goal — no goal to finish");
          }
        } else {
          const goal = setGoal(arg);
          this.transcript.addNotice(`/goal — [active] ${goal.text}`);
        }
        this.tui.requestRender();
        break;
      }
      case "clear":
        this.transport.setMessages([]);
        this.transcript.clear();
        this.transcript.addNotice("context cleared — the conversation history is reset; the session stays open");
        break;
      case "copy": {
        const what = argument.trim() || "code";
        const text = this.transcript.lastAssistantText();
        if (text.length === 0) {
          this.transcript.addNotice("/copy — nothing to copy yet (no assistant text)");
          break;
        }
        // /copy code → last fenced code block; /copy cmd → last shell/python
        // command line; /copy text → the whole last assistant block.
        let payload = text;
        if (what === "code" || what === "cmd") {
          const fences = text.match(/```[^\n]*\n([\s\S]*?)```/g);
          if (fences) {
            payload = fences[fences.length - 1]!.replace(/```[^\n]*\n|```$/g, "");
            if (what === "cmd") {
              // first non-empty, non-comment line
              payload = payload.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? payload;
            }
          } else if (what === "cmd") {
            // no code block — look for a $ or > prefixed line
            const cmdLine = text.match(/^\s*[$>]\s*(.+)$/m);
            payload = cmdLine ? cmdLine[1]! : text.split("\n")[0] ?? text;
          }
        }
        try {
          const { execFileSync } = await import("node:child_process");
          const bin = process.platform === "darwin" ? "pbcopy" : "wl-copy";
          execFileSync(bin, { input: payload, stdio: ["pipe", "ignore", "ignore"] });
          this.transcript.addNotice(`/copy ${what} — copied to clipboard (${payload.length} chars)`);
        } catch {
          this.transcript.addNotice(`/copy — clipboard unavailable (no pbcopy/wl-copy)`);
        }
        break;
      }
      case "stats": {
        const counts = this.transcript.blockCounts();
        const usage = this.status.currentState.usage;
        const msgCount = this.transport.getMessages().length;
        const ctxWindow = this.transport.getContextWindow();
        const tokens = usage ? usage.totalTokens : 0;
        const ctxPct = ctxWindow > 0 && tokens > 0 ? `${Math.round((tokens / ctxWindow) * 100)}% of ${Math.round(ctxWindow / 1000)}k ctx` : "—";
        this.transcript.addNotice([
          `/stats — session ${this.sessionId.slice(0, 8)}`,
          `messages: ${msgCount} in context · blocks: ${counts.user ?? 0} user · ${counts.assistant ?? 0} assistant · ${counts.tool ?? 0} tool`,
          `model: ${this.modelId} (${this.provider ?? "?"}) · ${tokens} tokens · ${ctxPct}`,
          `fusion pair: ${this.fusionPairLabel()}`,
        ]);
        break;
      }
      case "context": {
        const usage = this.status.currentState.usage;
        const tokens = usage?.totalTokens ?? 0;
        const ctxWindow = this.transport.getContextWindow();
        const msgCount = this.transport.getMessages().length;
        if (ctxWindow > 0 && tokens > 0) {
          const pct = Math.round((tokens / ctxWindow) * 100);
          this.transcript.addNotice(
            `/context — ${tokens} / ${ctxWindow} tokens (${pct}%) · ${msgCount} messages — ${pct > 70 ? "consider /compact" : "healthy"}`,
          );
        } else {
          this.transcript.addNotice(`/context — ${tokens} tokens · ${msgCount} messages`);
        }
        break;
      }
      case "compact": {
        // Real LLM-summarising compaction (E017 pick 1): the transport runs
        // pi-agent-core's structured checkpoint summariser (Goal / Progress /
        // Decisions / Next Steps) over the conversation and swaps in
        // summary + retained tail. The previous summary is passed along so a
        // second /compact folds new turns in incrementally instead of
        // starting cold.
        if (this.busy) {
          this.transcript.addNotice("/compact — a turn is running; compact when it settles");
          break;
        }
        const result = await this.transport.compactSession(this.compactSummary);
        if (result === undefined) {
          this.transcript.addNotice("/compact — nothing worth compacting yet");
          break;
        }
        this.compactSummary = result.summary;
        this.transcript.addNotice(
          `/compact — ${result.before} → ${result.after} messages (model-written summary + retained tail; the next compact updates it incrementally)`,
        );
        break;
      }
      case "shake": {
        // omp's /shake elide: strip heavy tool results from context to
        // reclaim tokens without a full /compact. We replace tool_result
        // content with a lightweight placeholder.
        const messages = this.transport.getMessages();
        let stripped = 0;
        const shaken = messages.map((msg) => {
          if (msg.role === "toolResult") {
            stripped += 1;
            return { ...msg, content: [{ type: "text", text: "[elided by /shake]" }] } as typeof msg;
          }
          return msg;
        });
        this.transport.setMessages(shaken);
        this.transcript.addNotice(
          `/shake — stripped ${stripped} tool result(s) from context (content replaced with placeholders)`,
        );
        break;
      }
      case "login":
        this.openSetup();
        break;
      case "logout": {
        const arg = argument.trim();
        if (!arg) {
          this.transcript.addNotice("/logout — specify a provider: /logout <provider>");
          break;
        }
        try {
          const models = defaultModels();
          await models.logout(arg);
          this.transcript.addNotice(`/logout — ${arg} signed out ✓`);
        } catch {
          this.transcript.addNotice(`/logout — ${arg} has no stored OAuth credential (key-based providers: remove the env var)`);
        }
        break;
      }
      case "undo":
        await this.undo();
        break;
      case "shift":
        this.showRoutingLedger();
        break;
      case "diff":
        await this.openDiff();
        break;
      case "exit":
      case "quit": // legacy alias — /exit is the name from v0.1.005
        this.onExit?.({ kind: "quit" });
        break;
      default:
        this.transcript.addNotice(`unknown command: /${name} — try /help`);
        break;
    }
    this.tui.requestRender();
  }

  /** Toggle bash mode (`!` at an empty draft) — the prompt-side shell. */
  toggleBash(): void {
    this.bashMode = !this.bashMode;
    this.status.update({ ...this.status.currentState, mode: this.bashMode ? "bash" : "chat" });
    this.transcript.addNotice(this.bashMode ? "bash mode — `$` shell, gated as usual; `!` to return" : "chat mode");
    this.tui.requestRender();
  }

  /** Submit a user prompt: persist + display + fire the transport turn. */
  async submit(text: string): Promise<void> {
    if (this.busy) {
      // Steer-while-busy (E017 dossier pick 2): route the text into the
      // RUNNING turn (pi's steering queue drains after the current turn's
      // tool batch) instead of rejecting it. The message renders with a dim
      // `→ steering` suffix so the operator sees it landed, and persists as
      // a real user message so /resume keeps it (pi persists steered
      // messages as user entries; so do we). Bash mode keeps the old
      // refusal — a steered `$ …` line would be a text injection, not a shell
      // run.
      if (this.bashMode) {
        this.transcript.addNotice("a turn is already running — wait for it to settle");
        this.tui.requestRender();
        return;
      }
      const steerMsg: AgentMessage = { role: "user", content: text, timestamp: Date.now() };
      await this.store.appendMessage(steerMsg);
      this.transcript.addUserMessage(text, "→ steering");
      this.recordPrompt(text);
      this.transport.steer(text);
      this.tui.requestRender();
      return;
    }
    if (this.bashMode) {
      await this.runShellTurn(text);
      return;
    }
    this.lastPrompt = text;
    // The boot card's moment is over the first time the operator works —
    // collapse it to a compact line and give the viewport to the session.
    if (!this.bootCollapsed) {
      this.bootCollapsed = true;
      this.transcript.collapseBoot(compactMark(CLI_VERSION));
    }
    const userMsg: AgentMessage = { role: "user", content: text, timestamp: Date.now() };
    await this.store.appendMessage(userMsg);
    this.transcript.addUserMessage(text);
    this.recordPrompt(text); // frecency history (scope §1.4) — best-effort
    this.btwTurn = false; // this is a normal user turn, not a /btw side channel
    // E017: the orchestrator decides the tier from the accumulated tool
    // signals BEFORE the turn starts (evidence-only — no signals, no switch).
    this.onBeforePrompt?.(text);
    this.setBusy(true);
    await this.transport.prompt(text);
  }

  /**
   * Magic-keyword turn (E017 UK round 4 — ultrathink/ultrareview): the
   * visible message echoes and persists EXACTLY as typed; the hidden notice
   * rides only in the model payload (OMP's semantics). The upgrade over OMP
   * is the fusion panel: ultrathink combines multiple models' reasoning,
   * ultrareview combines multiple reviewers over the shadow diff. Without a
   * fusion runner the turn degrades honestly to a single-model deep pass.
   */
  async runUltraTurn(text: string, keywords: MagicKeyword[]): Promise<void> {
    if (this.busy) {
      await this.submit(text); // steering path keeps its semantics
      return;
    }
    const keyword = keywords.includes("ultrareview") ? "ultrareview" : "ultrathink";
    this.lastPrompt = text;
    const userMsg: AgentMessage = { role: "user", content: text, timestamp: Date.now() };
    await this.store.appendMessage(userMsg);
    this.transcript.addUserMessage(text, `→ ${keyword}`);
    this.recordPrompt(text);
    this.btwTurn = false;
    if (keyword === "ultrareview") {
      await this.runUltraReview(text);
      return;
    }
    await this.runUltraThink(text);
  }

  /** ultrathink: the prompt to the fusion think panel (or single-model fallback). */
  private async runUltraThink(text: string): Promise<void> {
    const payload = `${text}\n\n${ULTRATHINK_NOTICE}`;
    this.setBusy(true);
    this.status.update({ ...this.status.currentState, activity: "ultrathinking…" });
    this.tui.requestRender();
    try {
      if (this.runFusion) {
        this.transcript.addNotice(`ultrathink: multi-model think — ${this.fusionPairLabel()} — combining…`);
        this.tui.requestRender();
        const result = await this.runFusion(payload);
        this.transcript.addFusionResult(result.outputs, result.synthesis);
      } else {
        this.transcript.addNotice("ultrathink: fusion unavailable — single-model deep think (max effort notice attached)");
        this.tui.requestRender();
        await this.transport.prompt(payload);
      }
    } catch (error) {
      this.transcript.addNotice(`ultrathink failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.setBusy(false);
      this.tui.requestRender();
    }
  }

  /** ultrareview: multi-model adversarial review of the shadow diff. */
  private async runUltraReview(text: string): Promise<void> {
    const shadow = new ShadowGit(this.cwd);
    const view = await shadow.diff();
    if (view === undefined || (view.diff.length === 0 && view.untracked.length === 0)) {
      this.transcript.addNotice("ultrareview: no changes against the shadow snapshot — nothing to review");
      this.tui.requestRender();
      return;
    }
    const diffText =
      view.diff.length > 0
        ? view.diff
        : `untracked since snapshot (${view.untracked.length}):\n${view.untracked.join("\n")}`;
    const task = [
      "Adversarial review of the change set below. Each reviewer attacks independently: bugs,",
      "logic errors, security issues, and regressions, with file/line evidence and severities.",
      "The synthesis combines both reviews into one deduplicated, severity-ordered verdict.",
      "",
      `Operator context: ${text}`,
      "",
      ULTRAREVIEW_NOTICE,
      "",
      "```diff",
      diffText.slice(0, 12000),
      "```",
    ].join("\n");
    this.setBusy(true);
    this.status.update({ ...this.status.currentState, activity: "ultrareviewing…" });
    this.tui.requestRender();
    try {
      if (this.runFusion) {
        const files = (view.diff.match(/^diff --git/gm) ?? []).length + view.untracked.length;
        this.transcript.addNotice(
          `ultrareview: multi-model review — ${this.fusionPairLabel()} — ${files} file(s) under review…`,
        );
        this.tui.requestRender();
        const result = await this.runFusion(task);
        this.transcript.addFusionResult(result.outputs, result.synthesis);
      } else {
        this.transcript.addNotice("ultrareview: fusion unavailable — single-model review");
        this.tui.requestRender();
        await this.transport.prompt(task);
      }
    } catch (error) {
      this.transcript.addNotice(`ultrareview failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.setBusy(false);
      this.tui.requestRender();
    }
  }

  /**
   /** Attach the session-name header bar (called by buildTuiApp). */
   attachHeader(header: Text): void {
     this.header = header;
     this.renderHeader();
   }

   private header?: Text;
   private sessionName: string | undefined;

   /** Set (or change) the session display name live — the /rename surface.
    *  The name is rendered raw into the header and the /resume picker, so it
    *  passes the same sanitiser as every other model-/file-sourced string
    *  (review: an on-disk session_name with escape bytes was an injection
    *  vector — OSC 52 clipboard writes, title spoofs, screen clears). */
   setSessionName(name: string | undefined): void {
     const clean = name !== undefined ? sanitizeTerminalText(name).replace(/\s+/g, " ").trim() : "";
     this.sessionName = clean === "" ? undefined : clean;
     this.renderHeader();
     this.tui.requestRender();
   }

   /** The current display name, if any. */
   get currentSessionName(): string | undefined {
     return this.sessionName;
   }

   private renderHeader(): void {
     if (!this.header) return;
     // Bound the always-visible chrome: long names truncate with an
     // ellipsis instead of hard-clipping against the session-id suffix.
     const MAX_NAME = 48;
     const name = this.sessionName;
     const clipped = name !== undefined && name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
     const label = clipped ?? `session ${this.sessionId.slice(0, 8)}`;
     const styled = clipped ? highlight.base(label) : textToken.dim(label);
     this.header.setText(` ${styled}${clipped ? textToken.dim(` · ${this.sessionId.slice(0, 8)}`) : ""}`);
   }

   /** `/btw` side channel (scope §1.5): the question is sent to the model but is
   * NOT rendered as a user turn and NOT persisted — the answer streams into a
   * system-marked `btw` block. The exchange is ephemeral (live agent context).
   */
  async btw(question: string): Promise<void> {
    if (this.busy) {
      this.transcript.addNotice("btw: a turn is already running — wait for it to settle");
      this.tui.requestRender();
      return;
    }
    this.transcript.beginBtwTurn(question);
    this.btwTurn = true; // mark the turn ephemeral — turn_end must NOT persist (scope §1.5)
    this.setBusy(true);
    this.tui.requestRender();
    await this.transport.prompt(question);
  }

  /** `/undo` surface (scope §1.6): restore the last gated mutation. */
  async undo(): Promise<void> {
    if (!this.onUndo) {
      this.transcript.addNotice("undo: unavailable (permission gate not enabled)");
      this.tui.requestRender();
      return;
    }
    try {
      const sha = await this.onUndo();
      this.transcript.addNotice(`undo: restored to snapshot ${sha.slice(0, 10)}`);
    } catch (error) {
      this.transcript.addNotice(`undo: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.tui.requestRender();
  }

  /**
   * `/shift` — the session routing ledger (E017 S1, OK-9.7 trust surface).
   * Reads `.openkai/activity.jsonl` (the same file `openkai tail` follows)
   * and renders the recent routing decisions: stage, model, tier, decision
   * source, and the one-line reason. Two rules from the tail reader hold
   * here: malformed rows are skipped (the file outlives any one writer), and
   * string fields are redacted on READ (a log written before a redactor
   * covered a provider still holds that key — rendering must not leak it).
   */
  private showRoutingLedger(): void {
    const file = activityLogPath(this.cwd);
    if (!existsSync(file)) {
      this.transcript.addNotice("/shift — no activity feed yet; routing decisions land here as turns route");
      return;
    }
    let rows: {
      ts?: string;
      kind?: string;
      stage?: string;
      model?: string;
      provider?: string;
      attempt?: number;
      tier?: string;
      source?: string;
      reason?: string;
    }[];
    try {
      rows = readFileSync(file, "utf-8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line) as (typeof rows)[number];
          } catch {
            return {}; // malformed row — skipped by the kind filter below
          }
        });
    } catch {
      this.transcript.addNotice(`/shift — could not read ${file}`);
      return;
    }
    const routing = rows.filter(
      (row) => row.kind === "routing" || row.kind === "fallback" || row.kind === "routing_error",
    );
    if (routing.length === 0) {
      this.transcript.addNotice("/shift — no routing decisions on the feed yet");
      return;
    }
    const recent = routing.slice(-12);
    const lines = recent.map((row) => {
      const time = (row.ts ?? "").slice(11, 19) || "?";
      // Redact on read (tail.ts's rule): every rendered string passes through
      // redactSecrets — a log written before a redactor covered a provider
      // still holds that key, and model/provider/reason can echo credentials.
      const stage = redactSecrets(row.stage ?? "?");
      if (row.kind === "routing_error") {
        return `${time}  ✗ routing: ${redactSecrets((row.reason ?? "").slice(0, 80))}`;
      }
      const tierLabel = row.tier
        ? ` [${redactSecrets(row.tier)}${row.source ? ` · ${redactSecrets(row.source)}` : ""}]`
        : "";
      const head =
        row.kind === "fallback"
          ? `${time}  ↻ ${stage} fallback → ${redactSecrets(row.model ?? "?")} (${redactSecrets(row.provider ?? "?")}, attempt ${row.attempt ?? "?"})${tierLabel}`
          : `${time}  ⇄ ${stage} → ${redactSecrets(row.model ?? "?")} (${redactSecrets(row.provider ?? "?")})${tierLabel}`;
      const reason = row.reason ? ` — ${redactSecrets(row.reason).slice(0, 80)}` : "";
      return `${head}${reason}`;
    });
    this.transcript.addNotice([
      `/shift — recent routing decisions (${routing.length} total; full feed: openkai tail)`,
      ...lines,
    ]);
  }

  /**
   * `/diff` — the shadow-git diff viewer (E017 S1, ren's TUI research). A
   * scrollable overlay showing the unified diff between the latest shadow
   * snapshot and the work tree. Read-only: the overlay never mutates the
   * shadow repo or the work tree (the git seam is {@link ShadowGit.diff}).
   */
  async openDiff(): Promise<void> {
    const shadow = new ShadowGit(this.cwd);
    const view = await shadow.diff();
    if (view === undefined) {
      this.transcript.addNotice("/diff — no snapshots yet; gated mutations snapshot the tree as they run");
      this.tui.requestRender();
      return;
    }
    const lines: string[] = [];
    if (view.diff.length > 0) lines.push(...view.diff.split("\n"));
    if (view.untracked.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push(`untracked since snapshot (${view.untracked.length}):`);
      for (const name of view.untracked.slice(0, 20)) lines.push(`  ? ${name}`);
      if (view.untracked.length > 20) lines.push(`  … ${view.untracked.length - 20} more`);
    }
    if (lines.length === 0) {
      this.transcript.addNotice(`/diff — work tree clean against snapshot ${view.base.slice(0, 8)}`);
      this.tui.requestRender();
      return;
    }
    const rows = Math.max(8, (this.tui.terminal.rows ?? 24) - 10);
    const overlay = new DiffOverlay(`diff — snapshot ${view.base.slice(0, 8)} → work tree`, lines, () => {
      this.tui.hideOverlay();
      this.refocusComposer();
    }, rows);
    this.tui.showOverlay(overlay, { anchor: "center", width: "80%", maxHeight: "80%" });
  }

  /** Ctrl+R — search the prompt history and reuse a match. */
  openHistorySearch(): void {
    const history = this.composer?.promptHistory ?? [];
    if (history.length === 0) {
      this.transcript.addNotice("history: no prompts yet");
      this.tui.requestRender();
      return;
    }
    // Frecency entries carry lastUsed (scope §1.4) — the overlay shows a
    // relative-time label when it knows the timestamp (E017 pick 6).
    const ranked = this.history?.ranked(Date.now()) ?? [];
    const tsByText = new Map(ranked.map((e) => [e.text, e.lastUsed]));
    const entries = history.map((text) => ({ text, timestamp: tsByText.get(text) }));
    const search = new HistorySearch(
      entries,
      (text) => {
        this.tui.hideOverlay();
        this.composer?.prefill(text);
        this.refocusComposer();
      },
      () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    );
    this.tui.showOverlay(search, { anchor: "center", width: "60%", maxHeight: "60%" });
  }

  /**
   * `/fork` — the fork-from-message picker (E017 dossier pick 3): every past
   * user message, newest first. Picking one forks the session AT THAT ENTRY
   * (contract #2 `store.forkAtEntry`), restores the picked text into the
   * composer, and switches to the fork via the /resume restart mechanics.
   */
  private async openForkPicker(): Promise<void> {
    const points = await this.store.listUserMessages();
    if (points.length === 0) {
      this.transcript.addNotice("/fork — no user messages to fork from yet");
      this.tui.requestRender();
      return;
    }
    const picker = new ForkPicker(
      points,
      (point) => {
        this.tui.hideOverlay();
        this.guard(this.forkAt(point), "/fork");
      },
      () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    );
    this.tui.showOverlay(picker, { anchor: "center", width: "60%", maxHeight: "60%" });
  }

  /** Fork at the picked entry, restore its text, and switch sessions. */
  private async forkAt(point: ForkPoint): Promise<void> {
    const fork = await this.store.forkAtEntry(point.entryId);
    // pi restores the forked user text into the editor so the operator can
    // edit + resubmit from the fork point; the runtime threads `prefill`
    // through the restart so it survives the session switch.
    this.composer?.editor.setText(point.text);
    this.transcript.addNotice(`forked → ${fork.sessionId.slice(0, 8)} at "${point.text.replace(/\s+/g, " ").slice(0, 40)}" — switching…`);
    this.tui.requestRender();
    this.onExit?.({ kind: "restart", sessionId: fork.sessionId, prefill: point.text });
  }

  /** Bare `/resume` — the searchable session picker (E017 dossier pick 5). */
  private async openSessionSearch(): Promise<void> {
    const root = this.sessionsRoot ?? path.join(this.cwd, ".openkai", "sessions");
    const rows = await readSessionSearchRows(root);
    if (rows.length === 0) {
      this.transcript.addNotice("resume: no sessions yet");
      this.tui.requestRender();
      return;
    }
    const picker = new SessionSearchPicker(
      rows,
      (sessionId) => {
        this.tui.hideOverlay();
        this.transcript.addNotice(`resuming ${sessionId.slice(0, 8)}…`);
        this.onExit?.({ kind: "restart", sessionId });
      },
      () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    );
    this.tui.showOverlay(picker, { anchor: "center", width: "64%", maxHeight: "70%" });
  }

  /** Bare `/fuse` — ask what to fuse instead of erroring (CTO feedback). */
  private openFuseMenu(): void {
    const last = this.transcript.lastUserText();
    const pair = this.fusionPairLabel();
    const entries = [
      ...(last ? [{ id: "last", label: "fuse the last prompt", description: last.slice(0, 40) }] : []),
      { id: "config", label: "configure fusion models", description: pair },
      { id: "type", label: "type a task", description: "drops /fuse <task> into the composer" },
      { id: "cancel", label: "cancel", description: "back to the app" },
    ];
    const picker = new LevelPicker("fuse", entries, "", (id) => {
      this.tui.hideOverlay();
      if (id === "config") {
        this.openFusionPairPicker();
        return;
      }
      if (id === "last" && last) {
        void this.fuse(last);
      } else if (id === "type") {
        this.composer?.editor.setText("/fuse ");
        this.refocusComposer();
      } else {
        this.refocusComposer();
      }
    }, () => {
      this.tui.hideOverlay();
      this.refocusComposer();
    });
    this.tui.showOverlay(picker, { anchor: "center", width: "50%", maxHeight: "60%" });
  }

  /** The active fusion pair as a one-line label (menu + notices). */
  private fusionPairLabel(): string {
    const architect = this.fusionArchitect ? `${this.fusionArchitect.modelId} (${this.fusionArchitect.provider})` : `${this.modelId} (session)`;
    const builder = this.fusionPartner ? `${this.fusionPartner.modelId} (${this.fusionPartner.provider})` : "same as model 1 (self-pair)";
    return `model 1: ${architect} · model 2: ${builder}`;
  }

  /**
   * The fusion pair picker (CTO): model 1 = provider → model, then model 2 =
   * provider → model — two explicit provider-first steps, never an implicit
   * session-model assumption. Top entries reset: step 1 offers the session
   * model (default), step 2 offers self-pair.
   */
  private openFusionPairPicker(): void {
    const stepProvider = (
      title: string,
      entries: { id: string; label: string; description: string }[],
      onPick: (providerId: string | undefined) => void,
    ): void => {
      const picker = new LevelPicker(title, entries, "", (id) => {
        this.tui.hideOverlay();
        onPick(id.startsWith("p:") ? id.slice(2) : undefined);
      }, () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      });
      this.tui.showOverlay(picker, { anchor: "center", width: "50%", maxHeight: "70%" });
    };

    const stepModel = (title: string, providerId: string, onPick: (modelId: string) => void): void => {
      const models = this.fusionModelRows(providerId);
      if (models.length === 0) {
        this.transcript.addNotice(`fusion: no models in catalogue for ${providerId}`);
        this.refocusComposer();
        return;
      }
      const picker = new LevelPicker(title, models, "", (id) => {
        this.tui.hideOverlay();
        onPick(id.slice(2));
      }, () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      });
      this.tui.showOverlay(picker, { anchor: "center", width: "56%", maxHeight: "70%" });
    };

    // Step 1 — model 1 (architect): the session-model reset, then every provider.
    stepProvider(
      "fusion model 1 (architect) — pick provider",
      [
        { id: "_session", label: `session model (default) — ${this.modelId}`, description: "use the session's current model" },
        ...this.fusionProviderRows(),
      ],
      (providerId) => {
        if (providerId === undefined) {
          this.fusionArchitect = undefined;
          this.afterArchitectPicked();
          return;
        }
        stepModel(`fusion model 1 — ${PROVIDERS[providerId]?.label ?? providerId}`, providerId, (modelId) => {
          this.fusionArchitect = { provider: providerId, modelId };
          this.afterArchitectPicked();
        });
      },
    );
  }

  /** Provider rows for the fusion pair pickers (one shape, both steps). */
  private fusionProviderRows(): { id: string; label: string; description: string }[] {
    return Object.entries(PROVIDERS).map(([id, info]) => {
      const status = providerKeyStatus(id);
      return {
        id: `p:${id}`,
        label: info.label,
        description: status.oauth ? "subscription" : status.configured ? "key set" : info.keyless ? "keyless" : "no key",
      };
    });
  }

  /** Model rows for one provider in the fusion pair pickers. */
  private fusionModelRows(providerId: string): { id: string; label: string; description: string }[] {
    return defaultModels().getModels(providerId).map((m) => ({
      id: `m:${m.id}`,
      label: m.name ?? m.id,
      description: [m.id, m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k ctx` : ""].filter(Boolean).join(" · "),
    }));
  }

  /** Step 2 — model 2 (builder), offered after model 1 settles. */
  private afterArchitectPicked(): void {
    const picker = new LevelPicker(
      "fusion model 2 (builder) — pick provider",
      [
        { id: "_self", label: "self-pair — same as model 1", description: "both roles use model 1 (E016's replicated default)" },
        ...this.fusionProviderRows(),
      ],
      "",
      (id) => {
        this.tui.hideOverlay();
        if (id === "_self") {
          this.fusionPartner = undefined;
          this.transcript.addNotice(`fusion pair set — ${this.fusionPairLabel()}`);
          this.refocusComposer();
          return;
        }
        const providerId = id.slice(2);
        const models = this.fusionModelRows(providerId);
        if (models.length === 0) {
          this.transcript.addNotice(`fusion: no models in catalogue for ${providerId}`);
          this.refocusComposer();
          return;
        }
        const modelPicker = new LevelPicker(`fusion model 2 — ${PROVIDERS[providerId]?.label ?? providerId}`, models, "", (modelPick) => {
          this.tui.hideOverlay();
          this.fusionPartner = { provider: providerId, modelId: modelPick.slice(2) };
          this.transcript.addNotice(`fusion pair set — ${this.fusionPairLabel()}`);
          this.refocusComposer();
        }, () => {
          this.tui.hideOverlay();
          this.refocusComposer();
        });
        this.tui.showOverlay(modelPicker, { anchor: "center", width: "56%", maxHeight: "70%" });
      },
      () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    );
    this.tui.showOverlay(picker, { anchor: "center", width: "50%", maxHeight: "70%" });
  }

  /** Bash-mode turn: run the command through the gated tool; render the outcome. */
  private async runShellTurn(command: string): Promise<void> {
    const transport = this.transport;
    if (typeof (transport as Partial<InProcessTransport>).runBash !== "function") {
      this.transcript.addNotice("bash mode: unavailable on this transport");
      this.tui.requestRender();
      return;
    }
    this.transcript.addUserMessage(`$ ${command}`);
    try {
      const { text, isError } = await (transport as InProcessTransport).runBash(command);
      const lines = text.split("\n").slice(0, 12);
      if (text.split("\n").length > 12) lines.push(`… ${text.split("\n").length - 12} more`);
      this.transcript.addNotice(lines.join("\n") || "(no output)");
      if (isError) this.transcript.addNotice("(command reported an error)");
    } catch (error) {
      this.transcript.addNotice(`bash: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.tui.requestRender();
  }

  /** `/retry [model-id]` — re-run the last prompt, optionally on another model. */
  async retry(argument: string): Promise<void> {
    if (!this.lastPrompt) {
      this.transcript.addNotice("retry: nothing to retry yet");
      this.tui.requestRender();
      return;
    }
    if (argument.length > 0) {
      this.applyModelSelection(this.provider ?? "openrouter", argument);
    }
    this.transcript.addNotice(`retrying: ${this.lastPrompt.slice(0, 80)}`);
    await this.submit(this.lastPrompt);
  }

  /** `/autonomy` — open the level picker (Enter applies). Direct arg still works. */
  /** Status-line preset picker (E017 UX: visible list, no blind cycling). */
  private openStatuslinePicker(): void {
    const entries = [
      { id: "default", label: "default", description: "brand · agent · provider · persist · state | tokens · model" },
      { id: "minimal", label: "minimal", description: "brand · state | model" },
      { id: "compact", label: "compact", description: "brand · provider · state | tokens · model" },
      { id: "full", label: "full", description: "every chip (incl. git, session, ctx)" },
    ];
    const active = readStatuslineChips().join(",");
    const current = Object.entries(STATUSLINE_PRESET_CHIPS).find(([, chips]) => chips.join(",") === active)?.[0] ?? "custom";
    const picker = new LevelPicker("status line", entries, current, (id) => {
      this.tui.hideOverlay();
      writeStatuslineChips(STATUSLINE_PRESET_CHIPS[id] ?? [...DEFAULT_STATUSLINE_CHIPS]);
      this.status.update({ ...this.status.currentState });
      this.transcript.addNotice(`status line: ${id}`);
      this.tui.requestRender();
      this.refocusComposer();
    }, () => {
      this.tui.hideOverlay();
      this.refocusComposer();
    });
    this.tui.showOverlay(picker, { anchor: "center", width: "56%", maxHeight: "60%" });
  }

  /** Routing posture picker (OK-9.7; visible list). */
  private openPosturePicker(): void {
    const entries = [
      { id: "quality", label: "quality", description: "capable-biased — escalate rarely (threshold 0.6)" },
      { id: "balanced", label: "balanced", description: "per-stage rest + Switchyard's 0.5 (default)" },
      { id: "saver", label: "saver", description: "efficient-biased — cheapest tier that holds (0.4)" },
    ];
    const current = readShiftConfig(readConfigFile()).posture ?? "balanced";
    const picker = new LevelPicker("routing posture", entries, current, (id) => {
      this.tui.hideOverlay();
      writeShiftPosture(id as "quality" | "balanced" | "saver");
      this.transcript.addNotice(`routing posture: ${id} (applies to the next routed turn)`);
      this.tui.requestRender();
      this.refocusComposer();
    }, () => {
      this.tui.hideOverlay();
      this.refocusComposer();
    });
    this.tui.showOverlay(picker, { anchor: "center", width: "56%", maxHeight: "60%" });
  }

  /** Theme picker (E017 UX): a visible list — no blind cycling. */
  private openThemePicker(): void {
    const picker = new ThemePicker({
      onApply: (id) => {
        this.tui.hideOverlay();
        writeConfigFile({ ...readConfigFile(), theme: id });
        if (id === "auto") {
          // Mid-session: never re-query OSC 11 on the TUI's stdin — the sync
          // COLORFGBG hint is enough here (the full query stays at boot).
          setTheme(detectThemeSync());
        } else {
          setTheme(id);
        }
        this.transcript.addNotice(`theme: ${id}${id === "auto" ? " (follows your terminal)" : ""}`);
        this.tui.requestRender();
        this.refocusComposer();
      },
      onCancel: () => {
        this.tui.hideOverlay();
        this.tui.requestRender();
        this.refocusComposer();
      },
    });
    this.tui.showOverlay(picker, { anchor: "center", width: "50%", maxHeight: "70%" });
  }

  /** `/autonomy` — open the level picker (droid). */
  private openAutonomyPicker(argument: string): void {
    if (!this.autonomySwitch) {
      this.transcript.addNotice("autonomy: unavailable (permission gate off)");
      this.tui.requestRender();
      return;
    }
    if (argument) {
      this.cycleAutonomy(argument);
      return;
    }
    const entries = [
      { id: "off", label: "off — ask every time", description: "every write/bash asks first (default)" },
      { id: "low", label: "low — trusted reads", description: `reads + writes inside ${this.cwd} auto; bash always asks` },
      { id: "med", label: "med — trusted folder", description: "writes in the working folder auto-approve; bash still asks" },
      { id: "high", label: "high — full access", description: "writes + bash auto-approve; only the protected-path floor (.env, keys, .ssh) still refuses" },
    ];
    const picker = new LevelPicker("autonomy", entries, this.autonomySwitch.current(), (id) => {
      this.tui.hideOverlay();
      this.cycleAutonomy(id);
      this.refocusComposer();
    }, () => {
      this.tui.hideOverlay();
      this.refocusComposer();
    });
    this.tui.showOverlay(picker, { anchor: "center", width: "50%", maxHeight: "60%" });
  }

  /** `/autonomy [off|low|med|high]` — the coarse visible axis (droid). */
  private cycleAutonomy(argument: string): void {
    if (!this.autonomySwitch) {
      this.transcript.addNotice("autonomy: unavailable (permission gate off)");
      this.tui.requestRender();
      return;
    }
    const levels = ["off", "low", "med", "high"] as const;
    let next: (typeof levels)[number];
    if ((levels as readonly string[]).includes(argument)) {
      next = argument as (typeof levels)[number];
    } else {
      const idx = levels.indexOf(this.autonomySwitch.current() as (typeof levels)[number]);
      next = levels[(idx + 1) % levels.length]!;
    }
    this.autonomySwitch.set(next);
    this.status.update({ ...this.status.currentState, autonomy: next });
    this.transcript.addNotice(
      `autonomy: ${next}` +
        (next === "med"
          ? " — in-cwd writes auto-approve (floor + bash still gate)"
          : next === "high"
            ? " — everything auto-approves except the deny floor"
            : ""),
    );
    this.tui.requestRender();
  }

  /** `/fuse <task>` (OK-7): run the fusion panel and render both roles + the attributed synthesis. */
  async fuse(task: string): Promise<void> {
    if (!this.runFusion) {
      this.transcript.addNotice("fuse: unavailable (no fusion runner on this transport)");
      this.tui.requestRender();
      return;
    }
    this.transcript.addNotice(`fusing: ${task.slice(0, 120)} (architect + builder, then synthesis…)`);
    this.tui.requestRender();
    try {
      const result = await this.runFusion(task);
      this.transcript.addFusionResult(result.outputs, result.synthesis);
      this.renderGateOutcome(result);
    } catch (error) {
      this.transcript.addNotice(`fuse failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.tui.requestRender();
  }

  /**
   * Render the fusion gate's verdict (E017 S1 — the gate verifies, and the
   * verdict must be SEEABLE). pass is a quiet confirmation; halt is a
   * danger notice naming the failing checks; weak-gate warns the proof is
   * empty; refused records that the operator declined the designed checks.
   * Check names are model-authored — the addNotice/addError choke point
   * sanitises them (E001 §2).
   */
  private renderGateOutcome(result: FuseResult): void {
    const gate = result.gate;
    switch (gate.outcome) {
      case "pass":
        this.transcript.addNotice(`gate: pass ✓ (${gate.rounds} evaluation round(s))`);
        break;
      case "halt": {
        const failing =
          result.gateRuns
            .at(-1)
            ?.results.filter((r) => !r.pass)
            .map((r) => r.check.name) ?? [];
        this.transcript.addError([
          `gate: HALT after ${gate.rounds} evaluation round(s) — the checks never went green`,
          ...failing.slice(0, 6).map((name) => `  ✗ ${name}`),
          "verbatim failures are in the fusion log (.openkai/fusion)",
        ]);
        break;
      }
      case "weak-gate":
        this.transcript.addNotice(
          "gate: weak-gate — the baseline was all-green BEFORE any work, so the gate proves nothing (the checks need a redesign)",
        );
        break;
      case "refused":
        this.transcript.addNotice("gate: refused — the designed checks were not approved; nothing executed");
        break;
      case "not-run":
        break;
    }
  }

  /** `/settings` — the configuration panel (opens on appearance). */
  openSettings(): void {
    this.openSettingsAt("appearance");
  }

  /** `/setup` — the onboarding panel: providers (sign-in) then model. */
  openSetup(): void {
    this.openSettingsAt("providers");
  }

  private openSettingsAt(tab: "appearance" | "providers"): void {
    const overlay = new SettingsOverlay(
      {
        pickModel: () => this.openModelPicker(),
        // No hideOverlay here: the settings row returns undefined, its
        // onSelect calls onClose — which closes settings — and the freshly
        // opened picker survives (same ordering as pickModel).
        pickTheme: () => {
          this.openThemePicker();
        },
        pickStatusline: () => {
          this.openStatuslinePicker();
        },
        pickPosture: () => {
          this.openPosturePicker();
        },
        setMemory: (mode, project) => {
          if (mode === "cortex") process.env.CORTEX_PROJECT = project;
          else delete process.env.CORTEX_PROJECT;
        },
        currentProject: process.env.CORTEX_PROJECT,
        signIn: (providerId) => this.openSignIn(providerId),
        setStatusline: (preset) => {
          writeStatuslineChips(STATUSLINE_PRESET_CHIPS[preset] ?? [...DEFAULT_STATUSLINE_CHIPS]);
          this.status.update({ ...this.status.currentState }); // live re-render of the chips
        },
        pickAutonomy: () => {
          this.tui.hideOverlay();
          this.openAutonomyPicker("");
        },
        currentAutonomy: () => this.autonomySwitch?.current() ?? "off",
      },
      () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
      tab,
    );
    this.tui.showOverlay(overlay, { anchor: "center", width: "64%", maxHeight: "80%" });
  }

  /**
   * 0.1.6 keyless boot: called once after `tui.start()` when the provider has
   * no credentials. Explains the state, then opens the sign-in overlay for
   * the active provider — configuration happens inside the running shell.
   */
  beginProviderSetup(providerId: string): void {
    this.transcript.addNotice(
      `No ${providerId} credentials found — OpenKai is fully usable once you sign in. ` +
        `Everything else (settings, memory, sessions) works now. Sign in below, or /setup later.`,
    );
    this.tui.requestRender();
    this.openSignIn(providerId);
  }

  /** In-TUI provider sign-in: OAuth lanes run the device flow; key lanes prompt inline. */
  private openSignIn(providerId: string): void {    const info = PROVIDERS[providerId];
    const status = providerKeyStatus(providerId);
    const done = (message: string): void => {
      this.tui.hideOverlay();
      this.transcript.addNotice(`Sign-in: ${message}`);
      this.tui.requestRender();
      this.openSettings(); // back to the list with fresh status
    };
    // OAuth lanes: route to the device flow whenever no credential SOURCE is
    // visible (status.via names one when an env key/OAuth token actually
    // exists). providerKeyStatus.configured is NOT the gate — it is true
    // unconditionally for oauth lanes (review: the OAuth overlay was dead
    // code and Codex/Copilot lanes printed a false "already signed in").
    if (info?.oauth && !status.via) {
      this.tui.showOverlay(
        new OAuthOverlay(this.tui, { providerId, providerLabel: info.label, onDone: done }),
        { anchor: "center", width: "64%", maxHeight: "80%" },
      );
      return;
    }
    const envKey = status.needsKey ?? info?.envKeys[0];
    if (!envKey) {
      if (info?.oauth) {
        // Credential already present (via names the source) — honest notice.
        this.transcript.addNotice(`${providerId}: already signed in (${status.via})`);
      } else {
        this.transcript.addNotice(`${providerId}: keyless lane — no sign-in needed`);
      }
      this.tui.requestRender();
      return;
    }
    this.tui.showOverlay(
      new SignInOverlay(this.tui, {
        providerId,
        providerLabel: info?.label ?? providerId,
        envKey,
        onDone: done,
      }),
      { anchor: "center", width: "64%", maxHeight: "80%" },
    );
  }

  /** `/model` — the two-level provider→model picker (world-class floor). */
  openModelPicker(): void {
    if (!this.modelSwitch) {
      this.transcript.addNotice(`model: ${this.modelId} (switching unavailable on this transport)`);
      this.tui.requestRender();
      return;
    }
    const providers = Object.entries(PROVIDERS).map(([id, info]) => {
      const status = providerKeyStatus(id);
      return {
        id,
        label: info.label,
        configured: status.configured,
        oauth: status.oauth,
      };
    });
    const catalogue = defaultModels();
    const picker = new ModelPicker(
      providers,
      (providerId) =>
        catalogue
          .getModels(providerId)
          .map((m) => ({
            id: m.id,
            name: m.name,
            contextWindow: m.contextWindow,
            cost: m.cost ? { input: m.cost.input, output: m.cost.output } : undefined,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      { provider: this.provider ?? "openrouter", modelId: this.modelId, effort: this.effortSwitch?.current() },
      (pickedProvider: string) =>
        configuredProviders().filter((id) => id !== pickedProvider),
      (selection) => {
        this.tui.hideOverlay();
        this.applyModelSelection(selection.provider, selection.modelId);
        if (this.effortSwitch && selection.effort) {
          this.effortSwitch.set(selection.effort as "off" | "minimal" | "low" | "medium" | "high");
          this.transcript.addNotice(`effort: ${selection.effort}`);
        }
        if (selection.partner) {
          this.fusionPartner = selection.partner;
          this.transcript.addNotice(
            `fusion partner: ${selection.partner.modelId} (${selection.partner.provider}) — /fuse uses it as the builder`,
          );
        } else {
          this.fusionPartner = undefined;
        }
        this.refocusComposer();
      },
      () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    );
    this.tui.showOverlay(picker, { anchor: "center", width: "60%", maxHeight: "70%" });
  }

  /** `/models` — the fullscreen hub (sidebar scopes + metadata model list). */
  openModelsHub(): void {
    const catalogue = defaultModels();
    const hub = new ModelsHub(
      Object.entries(PROVIDERS).map(([id, info]) => {
        const status = providerKeyStatus(id);
        return { id, label: info.label, configured: status.configured };
      }),
      (providerId) =>
        catalogue
          .getModels(providerId)
          .map((m) => ({
            id: m.id,
            name: m.name,
            contextWindow: m.contextWindow,
            cost: m.cost ? { input: m.cost.input, output: m.cost.output } : undefined,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      this.recentModels,
      { provider: this.provider ?? "openrouter", modelId: this.modelId },
      (provider, modelId) => {
        this.tui.hideOverlay();
        this.applyModelSelection(provider, modelId);
        this.refocusComposer();
      },
      () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    );
    this.tui.showOverlay(hub, { anchor: "center", width: "80%", maxHeight: "80%" });
  }

  /** Apply a picker selection: switch the session model + update chrome. */
  private applyModelSelection(provider: string, modelId: string): void {
    const catalogue = defaultModels();
    const model = catalogue.getModel(provider, modelId);
    if (!model || !this.modelSwitch) {
      this.transcript.addNotice(`model ${modelId} unavailable under ${provider}`);
      this.tui.requestRender();
      return;
    }
    this.provider = provider;
    this.modelId = modelId; // /stats + both pickers read this — keep it in sync
    this.modelSwitch(model);
    this.status.update({ ...this.status.currentState, modelId });
    this.recentModels = [`${provider}/${modelId}`, ...this.recentModels.filter((m) => m !== `${provider}/${modelId}`)].slice(0, 8);
    this.transcript.addNotice(`model: ${modelId} (${provider})`);
    // Fusion-first (E002): always surface the pairing suggestion.
    this.transcript.addNotice(suggestFusionPartner(provider, modelId));
    this.tui.requestRender();
  }
  /** `/effort [level]` — set or cycle reasoning effort for future turns. */
  cycleEffort(argument: string): void {
    if (!this.effortSwitch) return;
    const levels = ["off", "minimal", "low", "medium", "high"] as const;
    let next: (typeof levels)[number];
    if (argument && (levels as readonly string[]).includes(argument)) {
      next = argument as (typeof levels)[number];
    } else {
      const current = this.effortSwitch.current();
      const idx = levels.indexOf(current as (typeof levels)[number]);
      next = levels[(idx + 1) % levels.length]!;
    }
    this.effortSwitch.set(next);
    this.transcript.addNotice(`effort: ${next}`);
    this.tui.requestRender();
  }

  /** `/fast` — toggle fast mode (effort off) with a chrome note. */
  private fast = false;
  toggleFast(): void {
    if (!this.effortSwitch) return;
    this.fast = !this.fast;
    this.effortSwitch.set(this.fast ? "off" : "medium");
    this.transcript.addNotice(this.fast ? "fast mode: on (effort off)" : "fast mode: off (effort medium)");
    this.tui.requestRender();
  }

  /** Ctrl+J — in-product changelog (droid's "what just changed"). */
  openChangelog(): void {
    const lines = changelogHead();
    const palette = new CommandPalette({
      items: lines.map((line, i) => ({
        value: String(i),
        label: line.replace(/^#+\s*/, ""),
        description: "",
      })),
      onSelect: () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
      onCancel: () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    });
    this.tui.showOverlay(palette, { anchor: "center", width: "64%", maxHeight: "70%" });
  }

  /** Third-Esc rewind menu (droid panic-key grammar): undo discoverable from Esc. */
  openRewind(): void {
    const items: PaletteItem[] = [
      { value: "undo", label: "Undo last mutation", description: "restore the tree to the previous snapshot", action: () => void this.undo() },
      { value: "clear", label: "Clear draft", description: "wipe the composer", action: () => this.composer?.clear() },
      { value: "cancel", label: "Cancel", description: "never mind", action: () => undefined },
    ];
    const palette = new CommandPalette({
      items,
      onSelect: (item: PaletteItem) => {
        this.tui.hideOverlay();
        item.action?.();
        this.refocusComposer();
      },
      onCancel: () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    });
    this.tui.showOverlay(palette, { anchor: "center", width: "44%", maxHeight: "40%" });
  }

  /** Open the leader-key command palette (scope §1.3). */
  openPalette(): void {
    const actions = this.paletteActions();
    const items = buildPaletteItems(actions);
    const palette = new CommandPalette({
      items,
      onSelect: (item: PaletteItem) => {
        this.tui.hideOverlay();
        this.refocusComposer();
        const action = (item as PaletteItem & { action?: () => void }).action;
        if (action) action();
      },
      onCancel: () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    });
    this.tui.showOverlay(palette, { anchor: "center", width: "50%", maxHeight: "60%" });
  }

  /** The palette action table — each value maps to a controller method. */
  private paletteActions(): Record<string, () => void> {
    return {
      help: () => this.guard(this.dispatchCommand("help", ""), "/help"),
      model: () => this.guard(this.dispatchCommand("model", ""), "/model"),
      sessions: () => this.guard(this.dispatchCommand("sessions", ""), "/sessions"),
      resume: () => this.composer?.prefill("/resume "),
      new: () => this.guard(this.dispatchCommand("new", ""), "/new"),
      btw: () => this.composer?.prefill("/btw "),
      undo: () => this.guard(this.undo(), "/undo"),
      shift: () => this.guard(this.dispatchCommand("shift", ""), "/shift"),
      diff: () => this.guard(this.dispatchCommand("diff", ""), "/diff"),
      quit: () => this.guard(this.dispatchCommand("quit", ""), "/quit"),
      "toggle-thinking": () => this.toggleThinking(),
      palette: () => undefined,
      stash: () => this.stashOrPop(),
    };
  }

  /** Stash / pop the prompt draft (scope §1.4). */
  stashOrPop(): void {
    if (!this.composer) return;
    if (this.composer.text.trim().length > 0) {
      this.stash.push(this.composer.text);
      this.composer.clear();
      this.flash(`stashed (${this.stash.size})`);
      return;
    }
    const popped = this.stash.pop();
    if (popped === undefined) {
      this.flash("stash empty");
      return;
    }
    this.composer.clear();
    this.composer.insert(popped);
    this.flash("popped");
  }

  /**
   * Best-effort transient flash — `flash` lives on {@link TuiAltScreen}, not the
   * `TUI` base, so duck-type it (the headless test stub has no flash; no-ops).
   */
  private flash(message: string): void {
    (this.tui as { flash?: (m: string) => void }).flash?.(message);
  }

  /** Restore focus to the composer (after an overlay closes). */
  private refocusComposer(): void {
    if (this.composer) this.tui.setFocus(this.composer.editor);
    this.tui.requestRender();
  }

  /**
   * Seed the composer's prompt history with frecency-ranked prompts (scope
   * §1.4) so up-arrow recalls the most-frecent first (history[0] = top).
   */
  async seedHistory(): Promise<void> {
    if (!this.history || !this.composer) return;
    const now = Date.now();
    const ranked = this.history.ranked(now);
    // pi-tui's editor.addToHistory unshifts (prepends) and navigateHistory
    // reads history[0] first. To recall the most-frecent prompt first on
    // up-arrow, seed in reverse (worst-first) so the best entry is the LAST
    // unshifted and lands at history[0] (scope §1.4: "history recall ranks by
    // frecency").
    for (const entry of [...ranked].reverse()) {
      this.composer.editor.addToHistory(entry.text);
    }
  }

  /** Record a submitted prompt to the frecency store (best-effort persist). */
  private recordPrompt(text: string): void {
    if (!this.history) return;
    this.history.record(text, Date.now());
    void this.history.save().catch(() => undefined);
  }

  /** Consume the transport event stream to completion (drives the render). */
  async consume(): Promise<void> {
    for await (const event of this.transport.events()) {
      this.applyEvent(event);
      this.tui.requestRender();
    }
    this.setBusy(false);
    this.done = true;
  }

  /** Apply one event to the transcript + chrome (pure, testable). */
  applyEvent(event: SessionEvent): void {
    switch (event.kind) {
      case "connected":
        this.setActivity("connecting");
        this.setBusy(true);
        this.transcript.applyEvent(event);
        break;
      case "delta":
        this.setActivity(event.field === "thinking" ? "thinking" : "writing");
        this.transcript.applyEvent(event);
        break;
      case "tool_call":
        this.setActivity(`tool: ${event.toolName ?? "?"}`);
        this.transcript.applyEvent(event);
        break;
      case "tool_update":
        // Live task progress (E017 contract #3) — the transcript re-renders
        // the open card as a live row; the chrome follows the child's tool.
        this.transcript.applyEvent(event);
        break;
      case "tool_result":
        this.setActivity("settling");
        this.transcript.applyEvent(event);
        // Denial visibility (E019 inc 05): a gated refusal must tell the
        // OPERATOR plainly — which tool, why, and where to change it. The
        // tool result text is written for the model; this notice is for the
        // human.
        {
          const details = (event as { result?: { details?: unknown } }).result?.details;
          if (details !== null && typeof details === "object" && (details as { denied?: unknown }).denied === true) {
            const toolName = (event as { toolName?: string }).toolName ?? "tool";
            // `command`/`path` are model-controlled; flatten newlines so the
            // target can't forge extra danger-bordered notice lines (E019
            // area 5). ANSI/BEL stripped downstream by addError's sanitiser.
            const target = ((details as { command?: string }).command ?? (details as { path?: string }).path ?? "")
              .replace(/[\r\n]+/g, " ");
            const reason = denyReasonFromResult(event);
            this.transcript.addError([
              `permission denied: ${toolName}${target !== "" ? ` — ${target.slice(0, 80)}` : ""}`,
              `  ${reason}`,
              "  adjust: /autonomy (access level) · /settings → routing (per-tool policy) · ~/.openkai/config.json tools.approval",
            ]);
            this.tui.requestRender();
          }
        }
        break;
      case "usage":
        this.updateUsage(event.usage);
        break;
      case "turn_end":
        this.transcript.applyEvent(event);
        // The settled row (E019 inc 04): elapsed + tokens make the turn's
        // completion a visible full stop — finished vs crashed is never in
        // doubt, and a turn that produced nothing says so honestly. A turn
        // that settled as an error says THAT (E019 S1): the core emits
        // [error, turn_end] for stopReason "error", and a green ✓ after the
        // danger row would render the failure as success.
        const failedElapsedMs = this.turnErrorElapsedMs;
        this.turnErrorElapsedMs = null;
        const turnFailed = failedElapsedMs !== null;
        {
          const s = this.status.currentState;
          const elapsedMs = failedElapsedMs ?? (s.busySince !== null ? Date.now() - s.busySince : 0);
          const seconds = (elapsedMs / 1000).toFixed(1);
          const usage = s.usage;
          const parts = [turnFailed ? `✗ failed in ${seconds}s` : `✓ settled in ${seconds}s`];
          if (usage !== null && usage.totalTokens > 0) {
            parts.push(`↑${formatTokens(usage.input)} ↓${formatTokens(usage.output)}`);
            const tps = elapsedMs > 0 ? (usage.output / (elapsedMs / 1000)).toFixed(1) : "0";
            parts.push(`⚡${tps} tok/s`);
          }
          this.transcript.addNotice(parts.join(" · "));
        }
        this.setBusy(false);
        if (this.wantsAutoCompact) {
          // Deferred from updateUsage — safe now that no run is in flight.
          this.wantsAutoCompact = false;
          this.autoCompact();
        }
        // /btw turns are ephemeral — never re-persist them (scope §1.5).
        if (!this.btwTurn) {
          void this.persistTurn().catch((error: unknown) => {
            this.transcript.addError(`persist failed: ${error instanceof Error ? error.message : String(error)}`);
            this.tui.requestRender();
          });
        }
        this.btwTurn = false;
        // Attention (scope §1.1): a turn settled — if unfocused, bell/OSC + chrome.
        this.signalAttention(turnFailed ? "Turn failed" : "Turn complete");
        break;
      case "permission_request":
        if (this.transport.planMode) {
          // Cline's Plan mode: read-only — mutations are refused at the gate
          // without bothering the operator.
          this.transport.respond(event.requestId, "reject");
          this.transcript.addNotice(`plan mode — ${event.toolName} blocked (read-only)`);
          this.tui.requestRender();
          break;
        }
        // P4b: a gated tool is awaiting approval. Show the overlay; the
        // spinner reflects "waiting on you" (scope §5). The overlay's
        // onDecision calls transport.respond + hides the overlay. The event
        // pump keeps draining (consume loop is concurrent — scope §9): the
        // tool's execute() is blocked awaiting the matching respond() promise,
        // and the operator's input path (a separate event-loop task) resolves
        // it, so there is no shared turn and no deadlock.
        this.showPermission(event);
        this.signalAttention(`Permission required: ${event.toolName}`);
        break;
      case "session_end":
        this.transcript.applyEvent(event);
        this.setBusy(false);
        break;
      case "error": {
        this.transcript.applyEvent(event);
        // For stopReason "error" the paired turn_end arrives in the same
        // batch (core events.ts) — capture the real elapsed NOW, because
        // setBusy(false) clears busySince before turn_end reads it (E019 S1).
        const busySince = this.status.currentState.busySince;
        this.turnErrorElapsedMs = busySince !== null ? Date.now() - busySince : 0;
        this.setBusy(false);
        break;
      }
      default:
        break;
    }
  }

  /** Toggle thinking density (Ctrl+O). */
  toggleThinking(): boolean {
    return this.transcript.toggleThinking();
  }

  /**
   * Apply one shift {@link RoutingEvent} to the chrome + transcript (E017 S1,
   * OK-9.7 trust surface: operators tolerate routing they can see). The tier
   * chip lights on the first tier-aware decision; a flip renders the
   * transition (`eff▸cap` chip flash + a ledger notice naming the stage and
   * decision source). Reaffirmations are silent — the ledger (`/shift`,
   * `openkai tail`) is the full record; the chrome only speaks on CHANGE.
   *
   * Pure over the rendered state (no transport interaction) — the same
   * shape the facade emits on the activity stream (contract #3).
   */
  applyRoutingEvent(event: RoutingEvent): void {
    if (event.kind === "routing_error") {
      // addError sanitises (single choke point) — provider error bodies can
      // carry terminal control sequences even after core-side redaction.
      this.transcript.addError(`routing: ${event.reason ?? "unknown"}`);
      this.tui.requestRender();
      return;
    }
    if (event.kind === "fallback") {
      this.transcript.addNotice(
        `fallback: ${event.stage} → ${event.model ?? "?"} (${event.provider ?? "?"}, attempt ${event.attempt ?? "?"})`,
      );
      this.tui.requestRender();
      return;
    }
    // kind === "routing"
    const tier = event.tier;
    if (tier === undefined) return; // a plain stage route — the ledger has it; the chrome stays quiet
    const state = this.status.currentState;
    if (state.tier === tier) return; // reaffirmed — no noise
    const previous = state.tier;
    this.status.update({ ...state, tier, tierFrom: previous });
    this.transcript.addNotice(
      `tier: ${previous ?? "unset"} → ${tier} · ${event.stage} stage · source: ${event.source ?? "unknown"}`,
    );
    this.scheduleTierFlashClear();
    this.tui.requestRender();
  }

  /**
   * The transition flash window: after a flip the chip shows `t:eff▸cap` for
   * a few seconds, then settles to the muted current tier. Unref'd — a
   * pending flash must never hold the process open.
   */
  private tierFlashTimer: ReturnType<typeof setTimeout> | undefined;
  private scheduleTierFlashClear(): void {
    if (this.tierFlashTimer !== undefined) clearTimeout(this.tierFlashTimer);
    this.tierFlashTimer = setTimeout(() => {
      this.tierFlashTimer = undefined;
      const state = this.status.currentState;
      if (state.tierFrom === undefined) return;
      this.status.update({ ...state, tierFrom: undefined });
      this.tui.requestRender();
    }, 4000);
    this.tierFlashTimer.unref?.();
  }

  /** Tear down: abort + flush store + checkpoint + close transport. */
  async shutdown(): Promise<void> {
    if (this.busyTick !== undefined) {
      clearInterval(this.busyTick);
      this.busyTick = undefined;
    }
    if (this.tierFlashTimer !== undefined) {
      clearTimeout(this.tierFlashTimer);
      this.tierFlashTimer = undefined;
    }
    this.transport.abort();
    if (this.checkpoint) await this.checkpoint.flushNow();
    await this.transport.close();
  }

  get isDone(): boolean {
    return this.done;
  }

  // ── Attention (scope §1.1) ──────────────────────────────────────────────

  /** Light the amber chrome + fire a focus-gated bell/OSC (scope §1.1). */
  private signalAttention(title: string): void {
    if (this.notifier) this.notifier.notify(title);
    const unfocused = this.notifier ? !this.notifier.isFocused : false;
    this.setAttention(unfocused);
  }

  /** Clear the chrome attention state (called on operator input, scope §1.1). */
  clearAttention(): void {
    this.setAttention(false);
  }

  /** Mark the terminal focused (from DEC 1004 focus-in/out, scope §1.1). */
  setFocused(focused: boolean): void {
    this.notifier?.setFocused(focused);
    if (focused) this.setAttention(false);
  }

  private setAttention(on: boolean): void {
    const state = this.status.currentState;
    if (state.attention === on) return;
    this.status.update({ ...state, attention: on });
  }

  private busyTick?: ReturnType<typeof setInterval>;
  /** The boot card collapses on the first prompt (E019 inc 04). */
  private bootCollapsed = false;

  private setBusy(busy: boolean): void {
    this.busy = busy;
    // A new turn starts clean: drop any error captured by a turn that closed
    // without a paired turn_end, so it can't stamp the next settle row (E019 S1).
    if (busy) this.turnErrorElapsedMs = null;
    const state = this.status.currentState;
    this.status.update({
      ...state,
      busy,
      busySince: busy ? Date.now() : null,
      busyFrame: 0,
      activity: busy ? state.activity : "",
    });

    // The braille tick: 80ms frames while busy so the operator SEES the work
    // (spinner + activity + elapsed seconds in the chrome). Cleared on idle.
    if (busy && this.busyTick === undefined) {
      this.busyTick = setInterval(() => {
        const s = this.status.currentState;
        if (!s.busy) return;
        this.status.update({ ...s, busyFrame: s.busyFrame + 1 });
        // The thinking pulse rides the same tick (E019 inc 04).
        this.transcript.tickThinking(s.busyFrame);
        this.tui.requestRender();
      }, 80);
    } else if (!busy && this.busyTick !== undefined) {
      clearInterval(this.busyTick);
      this.busyTick = undefined;
    }
  }

  /** Update the "what it's doing" label in the busy chip. */
  private setActivity(activity: string): void {
    // Tool names are model-chosen (E001 F6c) — sanitise + flatten before chrome.
    const clean = sanitizeTerminalText(activity).replace(/\n/g, " ");
    const state = this.status.currentState;
    if (state.activity === clean) return;
    this.status.update({ ...state, activity: clean });
  }

  private setAwaitingApproval(awaiting: boolean): void {
    const state = this.status.currentState;
    this.status.update({ ...state, awaitingApproval: awaiting });
  }

  /** The permission request currently on screen (plan mode auto-rejects it). */
  private pendingPermission?: { requestId: string; toolName: string };

  /** Show the permission overlay for a `permission_request` event (P4b §5). */
  private showPermission(event: { requestId: string; toolName: string; rule: string; preview: PermissionPreview }): void {
    this.setAwaitingApproval(true);
    this.pendingPermission = { requestId: event.requestId, toolName: event.toolName };
    const overlay = new PermissionOverlay({
      toolName: event.toolName,
      rule: event.rule,
      preview: event.preview,
      onDecision: (decision: PermissionDecision) => {
        this.pendingPermission = undefined;
        try {
          this.transport.respond(event.requestId, decision);
        } catch {
          // Transport without a gate — already refused at emit time; ignore.
        }
        this.tui.hideOverlay();
        this.setAwaitingApproval(false);
        this.setBusy(true);
        this.tui.requestRender();
      },
    });
    this.tui.showOverlay(overlay, { anchor: "center", width: "60%" });
  }

  /**
   * Auto-reject an already-open permission overlay when plan mode turns on —
   * the operator just declared read-only, so a mutation awaiting approval on
   * a stale screen must not slip through.
   */
  private rejectOpenPermission(): void {
    const pending = this.pendingPermission;
    if (!pending) return;
    this.pendingPermission = undefined;
    try {
      this.transport.respond(pending.requestId, "reject");
    } catch {
      // Transport without a gate — nothing pending; still close the overlay.
    }
    this.tui.hideOverlay();
    this.setAwaitingApproval(false);
    this.transcript.addNotice(`plan mode — ${pending.toolName} blocked (read-only)`);
  }

  private updateUsage(usage: UsageSnapshot): void {    const state = this.status.currentState;
    const ctxWindow = this.transport.getContextWindow();
    const ctxPercent =
      ctxWindow > 0 && usage.totalTokens > 0
        ? Math.min(100, Math.round((usage.totalTokens / ctxWindow) * 100))
        : undefined;
    this.status.update({ ...state, usage, ctxPercent });
    // Auto-compact (E017 pick 1): when context crosses 80%, the transport's
    // LLM-summarising compaction swaps in summary + retained tail so the
    // session keeps going instead of hitting the wall.
    // Never mid-turn — rewriting the message list under a running agent would
    // corrupt the in-flight loop; defer to turn settlement (turn_end).
    if (ctxPercent !== undefined && ctxPercent >= 80 && featureEnabled("autoCompact")) {
      if (this.busy) {
        this.wantsAutoCompact = true;
      } else {
        this.autoCompact();
      }
    }
  }

  /** Set when context crossed the compact threshold mid-turn; run at turn_end. */
  private wantsAutoCompact = false;

  /**
   * The last compaction summary — passed back into the next compact so the
   * summariser folds new turns into it incrementally (E017 pick 1's
   * UPDATE_SUMMARIZATION_PROMPT path) instead of re-summarising from cold.
   */
  private compactSummary: string | undefined;

  /**
   * Auto-compact (E017 pick 1): the transport's real LLM-summarising
   * compaction (pi-agent-core's structured checkpoint summary + retained
   * tail) replaces the old elide-the-middle heuristic. Only fires when there
   * is something worth compacting; the summary is kept for the next
   * incremental update. The {@link onAutoCompact} tier-reeval hook still
   * fires after the swap (the Devin boundary: compaction is the free
   * tier-switch point).
   */
  private autoCompact(): void {
    const ctxPercent = this.status.currentState.ctxPercent ?? 0;
    void this.transport
      .compactSession(this.compactSummary)
      .then((result) => {
        if (result !== undefined) {
          this.compactSummary = result.summary;
          this.transcript.addNotice(
            `auto-compact — context at ${ctxPercent}%; summarised by the model (${result.before} → ${result.after} messages)`,
          );
        }
        // E017 (Devin boundary): compaction is the free tier-switch point —
        // the orchestrator re-evaluates with the latch bypassed.
        this.onAutoCompact?.();
        this.tui.requestRender();
      })
      .catch((error: unknown) => {
        this.transcript.addError(`auto-compact failed: ${error instanceof Error ? error.message : String(error)}`);
        this.tui.requestRender();
      });
  }

  /** Persist the settled assistant text at turn settlement. */
  private async persistTurn(): Promise<void> {
    const last = this.transcript.lastAssistantText();
    if (last.length === 0) return;
    const assistantMsg: AgentMessage = {
      role: "assistant",
      content: [{ type: "text", text: last }],
      timestamp: Date.now(),
    } as AgentMessage;
    await this.store.appendMessage(assistantMsg);
    if (this.checkpoint) {
      const entries = await this.store.readEntries();
      this.checkpoint.record(entries);
    }
  }
}
