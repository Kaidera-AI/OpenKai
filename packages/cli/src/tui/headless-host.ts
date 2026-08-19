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

import type { TUI, Component } from "@earendil-works/pi-tui";
import type { Models } from "@earendil-works/pi-ai";
import {
  InProcessTransport,
  SessionStore,
  type SessionTransport,
} from "@kaidera/openkai-core";
import { buildTuiApp, type TuiApp } from "./app.js";

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
  options: { width?: string | number; maxHeight?: string; anchor?: string } | undefined;
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
  showOverlay(component: Component, options?: OverlayEntry["options"]): void {
    this.overlayStack.push({ component, options });
    this.setFocus(component);
    this.dirty = true;
  }
  hideOverlay(): void {
    this.overlayStack.pop();
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
  const base = app.root.render(width);
  const overlay = tui.topOverlay();
  if (!overlay) return base.join("\n");
  const oWidth = overlayWidth(overlay.options?.width, width);
  const oLines = overlay.component.render(oWidth);
  const maxHeight = overlay.options?.maxHeight !== undefined ? Number.parseInt(overlay.options.maxHeight, 10) : undefined;
  const clipped = maxHeight !== undefined && !Number.isNaN(maxHeight) ? oLines.slice(0, Math.max(1, Math.floor((maxHeight / 100) * base.length))) : oLines;
  const padLeft = Math.max(0, Math.floor((width - oWidth) / 2));
  const startRow = Math.max(0, Math.floor((base.length - clipped.length) / 2));
  for (let i = 0; i < clipped.length && startRow + i < base.length; i += 1) {
    base[startRow + i] = " ".repeat(padLeft) + clipped[i]!;
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

export class HostedTui {
  readonly sessionId: string;
  private readonly virtual = new VirtualTui();
  private app!: TuiApp; // assigned in start() after buildTuiApp
  private readonly transport: SessionTransport;
  private readonly pump: NodeJS.Timeout;
  private lastState = "";
  private ended = false;

  private constructor(transport: SessionTransport, store: SessionStore, private readonly options: HostedTuiOptions) {
    this.transport = transport;
    this.sessionId = store.sessionId;
    const interval = Math.max(20, Math.round(1000 / (options.fps ?? 15)));
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
    // ONE consumer of the event stream: the controller's own consume loop.
    void app.controller.consume().catch(() => undefined);
    void (async () => {
      // Watch for the stream's end via the controller's done flag.
      for (;;) {
        if ((app.controller as unknown as { done?: boolean }).done === true) break;
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 200);
        await promise;
      }
      host.ended = true;
      options.onEnd?.();
    })();
    return host;
  }

  /** The settled frame (attach hello / replay): render at the given width. */
  settledFrame(width: number): string {
    return compositeFrame(this.app, this.virtual, width);
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

  /** Resize the virtual terminal (an attach with different geometry). */
  resize(columns: number, rows: number): void {
    this.virtual.terminal.columns = columns;
    this.virtual.terminal.rows = rows;
    this.virtual.dirty = true;
  }

  private tick(): void {
    if (this.ended) return;
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
  }

  /** Shut the host down (pump, transport). */
  async close(): Promise<void> {
    this.ended = true;
    clearInterval(this.pump);
    await this.transport.close();
  }
}
