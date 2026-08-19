/**
 * Provider sign-in overlay — the omp-grade path: enter a key in-app and it's
 * written to the credential store via the SINGLE write path
 * (provider-config.ts — the same code path the `openkai provider` CLI and
 * KOS's Settings UI use). OAuth lanes hand off to the device-code login flow.
 * Nobody edits a file by hand (CTO directive 2026-08-17).
 */

import { Input, Text } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { highlight, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";
import { writeProviderKey } from "../provider-config.js";

/** Write or replace one KEY=VALUE line via the shared provider-config path. */
export function writeEnvKey(key: string, value: string): void {
  writeProviderKey(key, value);
}

export interface SignInOverlayOptions {
  providerId: string;
  providerLabel: string;
  envKey: string;
  onDone: (message: string) => void;
}

/** The key-entry sign-in panel for API-key providers. */
export class SignInOverlay implements Component {
  private readonly input: Input;
  private readonly text: Text;

  constructor(private readonly tui: TUI, private readonly options: SignInOverlayOptions) {
    this.input = new Input();
    this.input.onSubmit = (value) => this.submit(value);
    this.input.onEscape = () => this.options.onDone("sign-in cancelled");
    this.input.focused = true;
    this.text = new Text(this.renderBody(), 1, 0);
  }

  private renderBody(): string {
    return [
      `${highlight.base(`sign in — ${this.options.providerLabel}`)}`,
      textToken.dim(`paste your ${this.options.envKey} · stored in ~/.openkai/.env (mode 600)`),
      "",
      textToken.muted(this.outcome ?? ""),
    ].join("\n");
  }

  private outcome = "";

  private submit(value: string): void {
    const key = value.trim();
    if (key.length === 0) {
      this.outcome = "empty key — nothing saved (Esc to cancel)";
      this.text.setText(this.renderBody());
      return;
    }
    writeEnvKey(this.options.envKey, key);
    this.options.onDone(`${this.options.providerLabel}: key saved ✓`);
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
  }

  render(width: number): string[] {
    const body = this.text.render(width);
    const inputLine = this.input.render(width - 4);
    return opaquePanel([
      ...body.slice(0, 3),
      ` ${textToken.muted("key:")} ${inputLine.join("")}`,
      ...body.slice(3),
      "",
      ` ${textToken.dim(renderOverlayFooter())}`,
    ], width);
  }

  invalidate(): void {
    this.text.invalidate();
  }
}
