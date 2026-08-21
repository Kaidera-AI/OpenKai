/**
 * Headless TUI host (OK-10 inc 11.2) — a real OpenKai TUI running against a
 * virtual terminal, its frames pulled instead of pushed. This is the
 * served-TUI host: the hub owns HostedTui instances; attaches receive frame
 * chunks and (read-write) inject input. One more consumer of the SAME
 * TuiController — S1 (one renderer, many consumers), S2 (everything through
 * the terminal seam), and the terminal TUI is untouched.
 *
 * Frame model (S4): a coalesced pump — components mark dirty via
 * requestRender; the pump emits at most one full frame per interval.
 * Attach hello replays the settled frame (S3: every pixel derives from
 * reconstructible state, so any attach width re-renders).
 */

import type { TUI, Component, OverlayOptions } from "@earendil-works/pi-tui";
import { compositeTuiLine } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import type { Models } from "@earendil-works/pi-ai";
import {
  InProcessTransport,
  SessionStore,
  type SessionTransport,
} from "@kaidera/openkai-core";
import { buildTuiApp, type TuiApp } from "./app.js";
import { clampColumns, clampRows } from "./layout.js";

/** Structured state frame (S6 — status without parsing ANSI). */
export interface HostState {
  busy: boolean;
  tier?: string;
  plan: boolean;
  model: string;
  sessionId: string;
}

export interface HostedTuiOptions {
  cwd: string;
  modelId: string;
  provider?: string;
  /** Injected Models collection (tests use the faux provider; prod uses defaultModels()). */
  models?: Models;
  /** Frames-per-second cap for the pump (default 15). */
  fps?: number;
  /** Called with each full frame (ANSI string) when the host re-renders. */
  onFrame: (frame: string) => void;
  /** Called with structured state when it changes (S6). */
  onState?: (state: HostState) => void;
  /** Called when the session's run ends (transport stream closes). */
  onEnd?: () => void;
}

type InputListener = (data: string) => { consume?: boolean } | void;

/** An overlay entry, mirroring pi-tui's stack (top = last). */
interface OverlayEntry {
  component: Component;
  options: OverlayOptions | undefined;
}

/** The virtual TUI: listeners held, focus tracked, dirty-flag render pull. */
class VirtualTui {
  readonly terminal = { columns: 100, rows: 30 };
  dirty = true;
  focusedComponent: Component | undefined;
  private readonly listeners = new Set<InputListener>();
  private readonly overlayStack: OverlayEntry[] = [];

  addInputListener(listener: InputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  dispatch(data: string): boolean {
    for (const listener of [...this.listeners]) {
      if (listener(data)?.consume === true) return true;
    }
    return false;
  }
  requestRender(): void {
    this.dirty = true;
  }
  setFocus(component: Component | undefined): void {
    this.focusedComponent = component;
  }
  private readonly focusStack: Array<Component | undefined> = [];

  showOverlay(component: Component, options?: OverlayEntry["options"]): void {
    this.focusStack.push(this.focusedComponent);
    this.overlayStack.push({ component, options });
    this.setFocus(component);
    this.dirty = true;
  }
  hideOverlay(): void {
    this.overlayStack.pop();
    // pi-tui restores the pre-overlay focus on pop (overlayFocusRestore);
    // without it, rw-attach input routes into the popped component (E017
    // review: permission decisions ate the composer's focus).
    const restore = this.focusStack.pop();
    const top = this.topOverlay();
    this.setFocus(top !== undefined ? top.component : restore);
    this.dirty = true;
  }
  hasOverlay(): boolean {
    return this.overlayStack.length > 0;
  }
  topOverlay(): OverlayEntry | undefined {
    return this.overlayStack[this.overlayStack.length - 1];
  }

  /** The TUI-shaped view the app codes against (mirrors the test stub). */
  asTui(): TUI {
    const self = this;
    const noop = (): void => {};
    return {
      terminal: self.terminal,
      mode: "fullscreen",
      children: [],
      addChild: noop,
      getShowHardwareCursor: () => false,
      setFocus: (c: Component | null) => self.setFocus(c ?? undefined),
      showOverlay: (c: Component, o?: OverlayEntry["options"]) => self.showOverlay(c, o),
      hideOverlay: () => self.hideOverlay(),
      hasOverlay: () => self.hasOverlay(),
      start: noop,
      stop: noop,
      requestRender: () => self.requestRender(),
      addInputListener: (listener: InputListener) => self.addInputListener(listener),
      invalidate: noop,
      render: () => [],
    } as unknown as TUI;
  }
}

/** Composite root + top overlay (center anchor, % width, maxHeight clip). */
function compositeFrame(app: TuiApp, tui: VirtualTui, width: number): string {
  // Use pi-tui's real height-aware layout engine. Calling root.render()
  // directly gives VStack an infinite height and lets transcript/composer push
  // status below a short served viewport.
  const base = renderLayoutFrame(app.root, width, tui.terminal.rows, () => tui.requestRender()).lines;
  const overlay = tui.topOverlay();
  if (!overlay) return base.join("\n");
  overlay.options?.visible?.(width, tui.terminal.rows);
  // pi-tui's compositeTuiLine preserves base content left/right of the
  // overlay — the previous whole-row replacement blanked the transcript
  // beside every picker/prompt in served frames.
  const oWidth = Math.min(overlayWidth(overlay.options?.width, width), width);
  const oLines = overlay.component.render(oWidth);
  const clipped = oLines.slice(0, overlayHeight(overlay.options?.maxHeight, base.length));
  const padLeft = Math.max(0, Math.floor((width - oWidth) / 2));
  const startRow = Math.max(0, Math.floor((base.length - clipped.length) / 2));
  for (let i = 0; i < clipped.length && startRow + i < base.length; i += 1) {
    base[startRow + i] = compositeTuiLine(base[startRow + i]!, clipped[i]!, padLeft, oWidth, width);
  }
  return base.join("\n");
}

function overlayWidth(spec: string | number | undefined, width: number): number {
  if (typeof spec === "number") return Math.min(spec, width);
  if (typeof spec === "string" && spec.endsWith("%")) {
    const pct = Number.parseInt(spec, 10);
    if (!Number.isNaN(pct)) return Math.max(20, Math.floor((pct / 100) * width));
  }
  return Math.floor(width * 0.6);
}

function overlayHeight(spec: string | number | undefined, height: number): number {
  if (typeof spec === "number") return Math.max(1, Math.min(Math.floor(spec), height));
  if (typeof spec === "string" && spec.endsWith("%")) {
    const pct = Number.parseInt(spec, 10);
    if (!Number.isNaN(pct)) return Math.max(1, Math.min(height, Math.floor((pct / 100) * height)));
  }
  return height;
}

export class HostedTui {
  readonly sessionId: string;
  private readonly virtual = new VirtualTui();
  private app!: TuiApp; // assigned in start() after buildTuiApp
  private readonly transport: SessionTransport;
  private lastState = "";
  private ended = false;

  private pump: NodeJS.Timeout | undefined;

  private constructor(transport: SessionTransport, store: SessionStore, private readonly options: HostedTuiOptions) {
    this.transport = transport;
    this.sessionId = store.sessionId;
  }

  /** Start the frame pump — called once `app` exists (never before: a tick
   *  with no app would throw inside the interval and kill the process). */
  private begin(): void {
    const interval = Math.max(20, Math.round(1000 / (this.options.fps ?? 15)));
    this.pump = setInterval(() => this.tick(), interval);
    this.pump.unref();
  }

  /** Create + boot a hosted session (transport + app + the consume loop). */
  static async start(options: HostedTuiOptions): Promise<HostedTui> {
    const store = new SessionStore({ root: `${options.cwd}/.openkai/sessions` });
    await store.ensure();
    const transport = new InProcessTransport({
      sessionId: store.sessionId,
      modelId: options.modelId,
      provider: options.provider,
      cwd: options.cwd,
      enablePermissions: true,
      ...(options.models !== undefined ? { models: options.models } : {}),
    });
    const host = new HostedTui(transport, store, options);
    const app = buildTuiApp(host.virtual.asTui(), {
      transport,
      modelId: options.modelId,
      sessionId: store.sessionId,
      persistMode: "local",
      store,
      cwd: options.cwd,
    });
    host.app = app;
    // The runtime focuses the composer at boot; the host does the same —
    // without it, injected input has nowhere to land.
    host.virtual.setFocus(app.composer.editor);
    host.begin();
    // ONE consumer of the event stream: the controller's own consume loop.
    void app.controller.consume().catch(() => undefined);
    void (async () => {
      // Watch for the stream's end via the controller's done flag. The
      // watcher exits with the host too (a rejected consume() must not pin
      // the event loop on a dead session), and the timer is unref'd.
      for (;;) {
        if ((app.controller as unknown as { done?: boolean }).done === true) {
          host.ended = true;
          options.onEnd?.();
          return;
        }
        if (host.ended) return;
        const { promise, resolve } = Promise.withResolvers<void>();
        const timer = setTimeout(resolve, 200);
        timer.unref();
        await promise;
      }
    })();
    return host;
  }

  /** The settled frame (attach hello / replay): render at the given width. */
  settledFrame(width: number = this.virtual.terminal.columns): string {
    const safeWidth = Math.min(HostedTui.MAX_COLUMNS, clampColumns(width));
    const previousWidth = this.virtual.terminal.columns;
    this.virtual.terminal.columns = safeWidth;
    try {
      return compositeFrame(this.app, this.virtual, safeWidth);
    } finally {
      this.virtual.terminal.columns = previousWidth;
    }
  }

  /** Inject input (read-write attaches only — the caller enforces S5). */
  input(data: string): void {
    if (!this.virtual.dispatch(data)) {
      const focused = this.virtual.focusedComponent;
      if (focused && typeof focused.handleInput === "function") {
        focused.handleInput(data);
      }
    }
    this.virtual.dirty = true;
  }

  /** Current structured state (S6). */
  state(): HostState {
    const status = this.app.status.currentState;
    return {
      busy: status.busy === true,
      ...(status.tier !== undefined ? { tier: status.tier } : {}),
      plan: status.plan === true,
      model: status.modelId,
      sessionId: this.sessionId,
    };
  }

  /** Attach a second (third, …) frame/state listener (each WS attach is one). */
  addTap(onFrame: (frame: string) => void, onState?: (state: HostState) => void): () => void {
    const tap = { onFrame, onState };
    this.taps.add(tap);
    return () => this.taps.delete(tap);
  }

  private readonly taps = new Set<{ onFrame: (frame: string) => void; onState?: (state: HostState) => void }>();

  /** Resize the virtual terminal (an attach with different geometry).
   *  Clamped: an unbounded width turns the next render's padding into an
   *  OOM/RangeError (E017 review — one frame killed the whole hub). */
  static readonly MAX_COLUMNS = 500;
  static readonly MAX_ROWS = 200;

  resize(columns: number, rows: number): void {
    this.virtual.terminal.columns = Math.min(HostedTui.MAX_COLUMNS, clampColumns(columns));
    this.virtual.terminal.rows = Math.min(HostedTui.MAX_ROWS, clampRows(rows));
    this.virtual.dirty = true;
  }

  private tick(): void {
    if (this.ended) return;
    // Containment: a render throw inside setInterval is an uncaught
    // exception that kills the hub process. Degrade one frame instead.
    try {
      if (this.virtual.dirty) {
        this.virtual.dirty = false;
        const frame = this.settledFrame(this.virtual.terminal.columns);
        this.options.onFrame(frame);
        for (const tap of this.taps) tap.onFrame(frame);
      }
      const current = JSON.stringify(this.state());
      if (current !== this.lastState) {
        this.lastState = current;
        const state = this.state();
        this.options.onState?.(state);
        for (const tap of this.taps) tap.onState?.(state);
      }
    } catch (error) {
      this.virtual.dirty = false;
      process.stderr.write(`hosted-tui tick: frame degraded (${error instanceof Error ? error.message : String(error)})\n`);
    }
  }

  /** Shut the host down (pump, transport). */
  async close(): Promise<void> {
    this.ended = true;
    if (this.pump !== undefined) clearInterval(this.pump);
    await this.transport.close();
  }
}
