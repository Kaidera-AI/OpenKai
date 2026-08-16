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
  listSessions,
  type FuseResult,
  type SessionEvent,
  type SessionTransport,
  type UsageSnapshot,
} from "@kaidera/openkai-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Transcript } from "./transcript.js";
import { Composer } from "./composer.js";
import { StatusLine, defaultStatusState } from "./status.js";
import { parseSlashCommand, helpText, buildPaletteItems } from "./commands.js";
import { PermissionOverlay, type PermissionDecision } from "./permission.js";
import { CommandPalette, type PaletteItem } from "./palette.js";
import { PromptStash, FrecencyHistory } from "./stash.js";
import { splashLines } from "./brand.js";
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
    // Brand moment: full splash exactly once, compact mark ever after
    // (droid bar; state is user-global, ~/.openkai/state.json).
    transcript.addNotice(splashLines(CLI_VERSION));
  }
  const statusState = defaultStatusState(options.modelId, options.sessionId, options.persistMode);
  statusState.agentName = agentName;
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
  private readonly modelId: string;
  private readonly sessionId: string;
  private readonly sessionsRoot?: string;
  private readonly onExit?: (request: ExitRequest) => void;
  private readonly notifier?: AttentionNotifier;
  private readonly stash: PromptStash;
  private readonly history?: FrecencyHistory;
  private readonly onUndo?: () => Promise<string>;
  private readonly runFusion?: (task: string) => Promise<FuseResult>;
  private composer?: Composer;
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
  }

  /** Attach the composer (set after construction so the controller can build it). */
  attachComposer(composer: Composer): void {
    this.composer = composer;
  }

  /** Execute a slash command (scope §4). Output is a local notice — never sent to the model. */
  async dispatchCommand(name: string, argument: string): Promise<void> {
    switch (name) {
      case "help":
        this.transcript.addNotice(helpText());
        break;
      case "model":
        this.transcript.addNotice(
          argument.length > 0
            ? `model: ${this.modelId} — changing the model mid-session is P4b; relaunch with --model ${argument}`
            : `model: ${this.modelId}`,
        );
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
      case "undo":
        await this.undo();
        break;
      case "quit":
        this.onExit?.({ kind: "quit" });
        break;
      default:
        this.transcript.addNotice(`unknown command: /${name} — try /help`);
        break;
    }
    this.tui.requestRender();
  }

  /** Submit a user prompt: persist + display + fire the transport turn. */
  async submit(text: string): Promise<void> {
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
        this.setBusy(true);
        this.transcript.applyEvent(event);
        break;
      case "delta":
        this.transcript.applyEvent(event);
        break;
      case "tool_call":
      case "tool_result":
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

  private setBusy(busy: boolean): void {
    this.busy = busy;
    const state = this.status.currentState;
    this.status.update({ ...state, busy });
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
