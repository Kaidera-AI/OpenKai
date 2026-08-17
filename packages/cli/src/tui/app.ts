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
 */

import { ScrollView, VStack } from "@earendil-works/pi-tui";
import type { Component, TUI, StackChild } from "@earendil-works/pi-tui";
import {
  CortexCheckpoint,
  SessionStore,
  forkSession,
  listSessions,
  sessionTree,
  type FuseResult,
  type InProcessTransport,
  type SessionEvent,
  type SessionTransport,
  type UsageSnapshot,
} from "@kaidera/openkai-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { PROVIDERS, providerKeyStatus, suggestFusionPartner, configuredProviders } from "../providers.js";
import { ModelPicker } from "./model-picker.js";
import { SettingsOverlay } from "./settings.js";
import { runWelcome, readConfig } from "./welcome.js";
import { helpIndex, helpTopic } from "../help.js";
import { FEATURES, featureEnabled, setFeature } from "./features.js";
import { setTheme, themeName, themeNames } from "./theme.js";
import { changelogHead } from "./changelog.js";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

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
import { Composer } from "./composer.js";
import { StatusLine, defaultStatusState } from "./status.js";
import { parseSlashCommand, helpText, buildPaletteItems } from "./commands.js";
import { PermissionOverlay, type PermissionDecision } from "./permission.js";
import { SignInOverlay } from "./signin.js";
import { OAuthOverlay } from "./oauth.js";
import { CommandPalette, type PaletteItem } from "./palette.js";
import { PromptStash, FrecencyHistory } from "./stash.js";
import { bootMark, capabilityRow } from "./brand.js";
import { CLI_VERSION } from "../version.js";
import type { AttentionNotifier } from "./attention.js";

/** Run mode resolved at startup (A1). */
export type RunMode = "local" | "managed";

/** What the app is asking the runtime to do next. */
export type ExitRequest =
  | { kind: "quit" }
  | { kind: "restart"; sessionId?: string };

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
    transcript.addNotice(bootMark(CLI_VERSION));
    // The capability row (droid's boot pattern): what this setup actually has.
    transcript.addNotice(
      capabilityRow({
        configuredProviders: configuredProviders().length,
        skills: countSkills(),
        mcpServers: countMcpServers(),
        agentsMdPresent: existsSync(path.join(process.cwd(), "AGENTS.md")),
      }),
    );
    // The daily tip (disable via /features tips) — teaching, not noise.
    if (featureEnabled("tips")) {
      transcript.addNotice(tipOfTheDay());
    }
  }
  const statusState = defaultStatusState(options.modelId, options.sessionId, options.persistMode);
  statusState.agentName = agentName;
  statusState.provider = options.provider ?? "";
  const status = new StatusLine(statusState);

  const controller = new TuiController(tui, options, transcript, status);
  const composer = new Composer(tui, {
    onSubmit: (text) => {
      const command = parseSlashCommand(text);
      if (command) {
        void controller.dispatchCommand(command.name, command.argument);
        return;
      }
      void controller.submit(text);
    },
  });
  controller.attachComposer(composer);

  const scroll = new ScrollView(transcript, { follow: "end", primary: true, scrollbar: "auto" });
  const root = new VStack(
    [
      { component: scroll, grow: 1 },
      { component: composer.editor, basis: "auto", shrink: 0 },
      { component: status, basis: 1, shrink: 0, minSize: 1 },
    ] as StackChild[],
    { gap: 0, align: "stretch" },
  );
  return { root, transcript, composer, status, controller };
}

/** Extract text from an AgentMessage for replay display. */
function messageText(msg: AgentMessage): string {
  if (!("content" in msg)) return "";
  const content = (msg as { content: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: "text"; text: string } => typeof p === "object" && p !== null && "type" in p && p.type === "text")
      .map((p) => p.text)
      .join("");
  }
  return "";
}

/** Controller — bridges the transport event stream to the transcript + chrome. */
export class TuiController {
  private readonly tui: TUI;
  private readonly transport: SessionTransport;
  private readonly store: SessionStore;
  private readonly checkpoint?: CortexCheckpoint;
  private readonly transcript: Transcript;
  private readonly status: StatusLine;
  private readonly sessionId: string;
  private readonly sessionsRoot?: string;
  private readonly onExit?: (request: ExitRequest) => void;
  private readonly notifier?: AttentionNotifier;
  private readonly stash: PromptStash;
  private readonly history?: FrecencyHistory;
  private readonly onUndo?: () => Promise<string>;
  private readonly runFusion?: (task: string) => Promise<FuseResult>;
  private provider?: string;
  private modelId: string;
  /** The picker's fusion partner (builder model for /fuse), or undefined for self-pairing. */
  fusionPartner?: { provider: string; modelId: string };
  private modelSwitch?: (model: Model<Api>) => void;
  private effortSwitch?: { set: (level: "off" | "minimal" | "low" | "medium" | "high") => void; current: () => string };
  private autonomySwitch?: { set: (level: "off" | "low" | "med" | "high") => void; current: () => string };
  private lastPrompt?: string;
  private composer?: Composer;
  /** Droid's `!` bash mode: submissions run through the gated bash tool. */
  bashMode = false;
  private busy = false;
  private done = false;
  /** True while the current turn is a `/btw` side channel (scope §1.5) — persistTurn skips it so the ephemeral exchange never re-persists the prior assistant block. */
  private btwTurn = false;

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
    this.provider = options.provider;
    this.modelSwitch = options.onSetModel;
    this.effortSwitch = options.onSetEffort;
    this.autonomySwitch = options.onSetAutonomy;
  }

  /** Attach the composer (set after construction so the controller can build it). */
  attachComposer(composer: Composer): void {
    this.composer = composer;
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
      case "model":
        this.openModelPicker();
        break;
      case "effort":
        this.cycleEffort(argument);
        break;
      case "fast":
        this.toggleFast();
        break;
      case "sessions": {
        const ids = await listSessions(this.sessionsRoot);
        this.transcript.addNotice(
          ids.length === 0 ? "sessions: none yet" : ["sessions:", ...ids.map((id) => `  ${id}${id === this.sessionId ? "  (current)" : ""}`)],
        );
        break;
      }
      case "new":
        this.transcript.addNotice("starting a fresh session…");
        this.onExit?.({ kind: "restart" });
        break;
      case "resume":
        if (argument.length === 0) {
          this.transcript.addNotice("resume: needs a session id — /resume <id> (see /sessions)");
          break;
        }
        this.transcript.addNotice(`resuming ${argument}…`);
        this.onExit?.({ kind: "restart", sessionId: argument });
        break;
      case "btw":
        if (argument.length === 0) {
          this.transcript.addNotice("btw: needs a side question — /btw <text>");
          break;
        }
        await this.btw(argument);
        break;
      case "fuse":
        if (argument.length === 0) {
          this.transcript.addNotice("fuse: needs a task — /fuse <task>");
          break;
        }
        await this.fuse(argument);
        break;
      case "retry":
        await this.retry(argument);
        break;
      case "fork": {
        const fork = await forkSession(this.store);
        this.transcript.addNotice(
          `forked → ${fork.sessionId.slice(0, 8)} — resume with: openkai --session ${fork.sessionId}`,
        );
        break;
      }
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
      case "autonomy":
        this.cycleAutonomy(argument);
        break;
      case "theme": {
        const names = themeNames();
        const next = names[(names.indexOf(themeName) + 1) % names.length]!;
        setTheme(next);
        this.transcript.addNotice(`theme: ${next} (restart paints every surface; ${names.length} themes cycle with /theme)`);
        this.tui.requestRender();
        break;
      }
      case "welcome":
      case "setup":
      case "settings":
        this.openSettings();
        break;
      case "undo":
        await this.undo();
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
    if (this.bashMode) {
      await this.runShellTurn(text);
      return;
    }
    this.lastPrompt = text;
    const userMsg: AgentMessage = { role: "user", content: text, timestamp: Date.now() };
    await this.store.appendMessage(userMsg);
    this.transcript.addUserMessage(text);
    this.recordPrompt(text); // frecency history (scope §1.4) — best-effort
    this.btwTurn = false; // this is a normal user turn, not a /btw side channel
    this.setBusy(true);
    await this.transport.prompt(text);
  }

  /**
   * `/btw` side channel (scope §1.5): the question is sent to the model but is
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
      if (result.gate.outcome !== "not-run") {
        this.transcript.addNotice(`gate: ${result.gate.outcome} (${result.gate.rounds} round(s))`);
      }
    } catch (error) {
      this.transcript.addNotice(`fuse failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.tui.requestRender();
  }

  /** `/setup` `/settings` — the in-TUI settings panel. Never exits the app. */
  openSettings(): void {
    const overlay = new SettingsOverlay(
      {
        pickModel: () => this.openModelPicker(),
        toggleTheme: () => {
          const names = themeNames();
          const next = names[(names.indexOf(themeName) + 1) % names.length]!;
          setTheme(next);
          return `theme: ${next}`;
        },
        setMemory: (mode, project) => {
          if (mode === "cortex") process.env.CORTEX_PROJECT = project;
          else delete process.env.CORTEX_PROJECT;
        },
        currentProject: process.env.CORTEX_PROJECT,
        signIn: (providerId) => this.openSignIn(providerId),
      },
      () => {
        this.tui.hideOverlay();
        this.refocusComposer();
      },
    );
    this.tui.showOverlay(overlay, { anchor: "center", width: "64%", maxHeight: "80%" });
  }

  /** In-TUI provider sign-in: OAuth lanes run the device flow; key lanes prompt inline. */
  private openSignIn(providerId: string): void {
    const info = PROVIDERS[providerId];
    const status = providerKeyStatus(providerId);
    const done = (message: string): void => {
      this.tui.hideOverlay();
      this.transcript.addNotice(`Sign-in: ${message}`);
      this.tui.requestRender();
      this.openSettings(); // back to the list with fresh status
    };
    if (info?.oauth && !status.configured) {
      this.tui.showOverlay(
        new OAuthOverlay(this.tui, { providerId, providerLabel: info.label, onDone: done }),
        { anchor: "center", width: "64%", maxHeight: "80%" },
      );
      return;
    }
    const envKey = status.needsKey ?? info?.envKeys[0];
    if (!envKey) {
      this.transcript.addNotice(`${providerId}: already signed in`);
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
    const catalogue = builtinModels();
    const picker = new ModelPicker(
      providers,
      (providerId) =>
        catalogue
          .getModels(providerId)
          .map((m) => ({ id: m.id, name: m.name }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      { provider: this.provider ?? "openrouter", modelId: this.modelId, effort: this.effortSwitch?.current() },
      (pickedProvider) =>
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

  /** Apply a picker selection: switch the session model + update chrome. */
  private applyModelSelection(provider: string, modelId: string): void {
    const catalogue = builtinModels();
    const model = catalogue.getModel(provider, modelId);
    if (!model || !this.modelSwitch) {
      this.transcript.addNotice(`model ${modelId} unavailable under ${provider}`);
      this.tui.requestRender();
      return;
    }
    this.provider = provider;
    this.modelSwitch(model);
    this.status.update({ ...this.status.currentState, modelId });
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
      help: () => void this.dispatchCommand("help", ""),
      model: () => void this.dispatchCommand("model", ""),
      sessions: () => void this.dispatchCommand("sessions", ""),
      resume: () => this.composer?.prefill("/resume "),
      new: () => void this.dispatchCommand("new", ""),
      btw: () => this.composer?.prefill("/btw "),
      undo: () => void this.undo(),
      quit: () => void this.dispatchCommand("quit", ""),
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
      case "tool_result":
        this.setActivity("settling");
        this.transcript.applyEvent(event);
        break;
      case "usage":
        this.updateUsage(event.usage);
        break;
      case "turn_end":
        this.transcript.applyEvent(event);
        this.setBusy(false);
        if (!this.btwTurn) void this.persistTurn(); // /btw turns are ephemeral — never re-persist (scope §1.5)
        this.btwTurn = false;
        // Attention (scope §1.1): a turn settled — if unfocused, bell/OSC + chrome.
        this.signalAttention("Turn complete");
        break;
      case "permission_request":
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
      case "error":
        this.transcript.applyEvent(event);
        this.setBusy(false);
        break;
      default:
        break;
    }
  }

  /** Toggle thinking density (Ctrl+O). */
  toggleThinking(): boolean {
    return this.transcript.toggleThinking();
  }

  /** Tear down: abort + flush store + checkpoint + close transport. */
  async shutdown(): Promise<void> {
    if (this.busyTick !== undefined) {
      clearInterval(this.busyTick);
      this.busyTick = undefined;
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

  private setBusy(busy: boolean): void {
    this.busy = busy;
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
        this.tui.requestRender();
      }, 80);
    } else if (!busy && this.busyTick !== undefined) {
      clearInterval(this.busyTick);
      this.busyTick = undefined;
    }
  }

  /** Update the "what it's doing" label in the busy chip. */
  private setActivity(activity: string): void {
    const state = this.status.currentState;
    if (state.activity === activity) return;
    this.status.update({ ...state, activity });
  }

  private setAwaitingApproval(awaiting: boolean): void {
    const state = this.status.currentState;
    this.status.update({ ...state, awaitingApproval: awaiting });
  }

  /** Show the permission overlay for a `permission_request` event (P4b §5). */
  private showPermission(event: { requestId: string; toolName: string; rule: string; preview: import("@kaidera/openkai-core").PermissionPreview }): void {
    this.setAwaitingApproval(true);
    const overlay = new PermissionOverlay({
      toolName: event.toolName,
      rule: event.rule,
      preview: event.preview,
      onDecision: (decision: PermissionDecision) => {
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

  private updateUsage(usage: UsageSnapshot): void {
    const state = this.status.currentState;
    this.status.update({ ...state, usage });
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
