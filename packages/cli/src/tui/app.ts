/**
 * TUI app + controller (scope §4 `app.ts`).
 *
 * Builds the layout root — `VStack([ScrollView(transcript), composer.editor,
 * status])` — and the {@link TuiController} that wires the P2
 * {@link SessionTransport} event stream to the transcript + status chrome.
 * The same transport drives the loop; the TUI is the second renderer
 * (scope §1: "same transport, second renderer — do not fork the loop").
 *
 * Two entry points:
 *  - {@link buildTuiApp} — builds the layout + controller against a given
 *    `TUI` (real {@link TuiAltScreen} or a headless stub for golden-frame tests).
 *  - {@link runTui} — the real runtime: ProcessTerminal + TuiAltScreen, input
 *    listener for Ctrl+O / double-Esc / Ctrl+C quit-with-confirm, event loop.
 *
 * Run modes (A1): `standalone-local` (no `CORTEX_PROJECT` or Cortex unreachable
 * → local JSONL only, chrome shows `local`, no crash) vs `KOS-managed` (project
 * resolved + reachable → Cortex checkpoints on, chrome shows the project key).
 */

import { ScrollView, VStack } from "@earendil-works/pi-tui";
import type { Component, TUI, StackChild } from "@earendil-works/pi-tui";
import {
  CortexCheckpoint,
  SessionStore,
  listSessions,
  type SessionEvent,
  type SessionTransport,
  type UsageSnapshot,
} from "@openkai/core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Transcript } from "./transcript.js";
import { Composer } from "./composer.js";
import { StatusLine, defaultStatusState } from "./status.js";
import { parseSlashCommand, helpText } from "./commands.js";

/** Run mode resolved at startup (A1). */
export type RunMode = "local" | "managed";

/**
 * What the app is asking the runtime to do next. `/quit` + Ctrl+C×2 end the
 * process; `/new` and `/resume <id>` ask the runtime to tear the session down
 * and rebuild against a different session id (scope §4 session resume).
 */
export type ExitRequest =
  | { kind: "quit" }
  | { kind: "restart"; sessionId?: string };

/** Options shared by both entry points. */
export interface TuiAppOptions {
  /** The transport driving the loop (P2 InProcessTransport or a test double). */
  transport: SessionTransport;
  /** Model id for the chrome. */
  modelId: string;
  /** Session id for the chrome + persistence. */
  sessionId: string;
  /** Persist-mode label shown in the chrome (`local` or the project key). */
  persistMode: string;
  /** Local JSONL session store (always present — both modes persist locally). */
  store: SessionStore;
  /** Optional Cortex checkpoint (managed mode only; `undefined` in local mode). */
  checkpoint?: CortexCheckpoint;
  /** Initial transcript messages to replay (session resume). */
  replayMessages?: AgentMessage[];
  /** Root of the local session store — read by `/sessions` (default: store root). */
  sessionsRoot?: string;
  /** Called when the app wants to exit or switch session (`/quit`, `/new`, `/resume`). */
  onExit?: (request: ExitRequest) => void;
}

/** The built TUI app handle. */
export interface TuiApp {
  /** Layout root — render this headlessly (`root.render(width)`) or set as the alt-screen layout root. */
  root: Component;
  transcript: Transcript;
  composer: Composer;
  status: StatusLine;
  controller: TuiController;
}

/**
 * Build the TUI layout + controller against a `TUI`. Used by both the real
 * runtime (real `TUI`) and headless golden-frame tests (stub `TUI`).
 */
export function buildTuiApp(tui: TUI, options: TuiAppOptions): TuiApp {
  const transcript = new Transcript();
  // Replay prior messages (session resume) into the transcript as user/assistant blocks.
  if (options.replayMessages) {
    for (const msg of options.replayMessages) {
      if (!("role" in msg)) continue;
      const role = (msg as { role: string }).role;
      const text = messageText(msg);
      if (role === "user") transcript.addUserMessage(text);
      else if (role === "assistant") transcript.replayAssistant(text);
    }
  }

  const statusState = defaultStatusState(options.modelId, options.sessionId, options.persistMode);
  const status = new StatusLine(statusState);

  // The controller owns the submit path: it persists + renders the user message
  // before prompting the model. The composer must route through it — calling
  // `transport.prompt` directly would stream a reply for a prompt that was
  // never shown in the transcript and never written to the session JSONL.
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

/** Extract text from an AgentMessage for replay display (handles the AgentMessage union). */
function messageText(msg: AgentMessage): string {
  // Only standard Message roles (user/assistant/toolResult) carry `content`;
  // custom message kinds (bash exec, notifications, …) don't and are skipped.
  if (!("content" in msg)) return "";
  const content = (msg as { content: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (p): p is { type: "text"; text: string } =>
          typeof p === "object" && p !== null && "type" in p && p.type === "text",
      )
      .map((p) => p.text)
      .join("");
  }
  return "";
}

/**
 * Controller — bridges the transport event stream to the transcript + chrome
 * and owns persistence (local store always; Cortex checkpoint in managed mode).
 */
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
  private busy = false;
  private done = false;

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
  }

  /**
   * Execute a slash command (scope §4). Command output is a local notice block
   * — never sent to the model, never persisted. Unknown commands report rather
   * than silently prompting the model with the raw `/text`.
   */
  async dispatchCommand(name: string, argument: string): Promise<void> {
    switch (name) {
      case "help":
        this.transcript.addNotice(helpText());
        break;
      case "model":
        // P4a shows the model; cycling/changing is P4b (scope §3.4).
        this.transcript.addNotice(
          argument.length > 0
            ? `model: ${this.modelId} — changing the model mid-session is P4b; relaunch with --model ${argument}`
            : `model: ${this.modelId}`,
        );
        break;
      case "sessions": {
        const ids = await listSessions(this.sessionsRoot);
        this.transcript.addNotice(
          ids.length === 0
            ? "sessions: none yet"
            : ["sessions:", ...ids.map((id) => `  ${id}${id === this.sessionId ? "  (current)" : ""}`)],
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
    this.setBusy(true);
    await this.transport.prompt(text);
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
        void this.persistTurn();
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

  /** True once the transport stream has ended (session_end / close). */
  get isDone(): boolean {
    return this.done;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    const state = this.status.currentState;
    this.status.update({ ...state, busy });
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