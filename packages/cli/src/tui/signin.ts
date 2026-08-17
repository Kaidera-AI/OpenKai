/**
 * Provider sign-in overlay — the omp-grade path: enter a key in-app and it's
 * written to ~/.openkai/.env; OAuth lanes hand off to the device-code login
 * flow. Nobody edits a file by hand (CTO directive 2026-08-17).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Input, Text } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { highlight, renderOverlayFooter, text as textToken } from "./theme.js";

const envFile = (): string => path.join(homedir(), ".openkai", ".env");

/** Write or replace one KEY=VALUE line in ~/.openkai/.env. */
export function writeEnvKey(key: string, value: string): void {
  const file = envFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const lines = existsSync(file) ? readFileSync(file, "utf-8").split("\n") : [];
  const entry = `${key}=${value}`;
  const index = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (index >= 0) lines[index] = entry;
  else lines.push(entry);
  writeFileSync(file, lines.filter((l) => l.trim().length > 0).join("\n") + "\n", { mode: 0o600 });
  process.env[key] = value;
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
    return [
      ...body.slice(0, 3),
      ` ${textToken.muted("key:")} ${inputLine.join("")}`,
      ...body.slice(3),
      "",
      ` ${textToken.dim(renderOverlayFooter())}`,
    ];
  }

  invalidate(): void {
    this.text.invalidate();
  }
}
