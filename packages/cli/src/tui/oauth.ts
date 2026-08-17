/**
 * In-TUI OAuth login overlay — the subscription flow stitched like omp's:
 * the device-code URL + user code render in place, the browser opens, the
 * flow polls to completion, and the credential lands in pi-ai's store. The
 * operator never leaves the TUI (CTO directive).
 */

import { execFile } from "node:child_process";

import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Input, Text } from "@earendil-works/pi-tui";
import { highlight, renderOverlayFooter, text as textToken } from "./theme.js";

function openBrowser(url: string): void {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  execFile(opener, [url], () => undefined);
}

export interface OAuthOverlayOptions {
  providerId: string;
  providerLabel: string;
  onDone: (message: string) => void;
}

type State =
  | { phase: "starting" }
  | { phase: "device"; uri: string; code: string }
  | { phase: "polling"; note: string }
  | { phase: "input"; message: string; resolve: (value: string) => void }
  | { phase: "done"; ok: boolean; note: string };

/** Drives `models.login(provider, "oauth", interaction)` inside an overlay. */
export class OAuthOverlay implements Component {
  private state: State = { phase: "starting" };
  private readonly text: Text;
  private readonly input: Input;

  constructor(private readonly tui: TUI, private readonly options: OAuthOverlayOptions) {
    this.text = new Text(this.renderBody(), 1, 0);
    this.input = new Input();
    this.input.focused = false;
    void this.run();
  }

  private setState(state: State): void {
    this.state = state;
    this.text.setText(this.renderBody());
    this.tui.requestRender();
  }

  private renderBody(): string {
    const head = `${highlight.base(`sign in — ${this.options.providerLabel}`)}`;
    switch (this.state.phase) {
      case "starting":
        return [head, textToken.dim("contacting the provider…")].join("\n");
      case "device":
        return [
          head,
          "",
          `${textToken.strong("1.")} open: ${highlight.base(this.state.uri)}`,
          `${textToken.strong("2.")} enter code: ${highlight.base(this.state.code)}`,
          "",
          textToken.dim("the browser opened for you — complete the sign-in there; this page continues on its own"),
        ].join("\n");
      case "polling":
        return [head, textToken.dim(this.state.note)].join("\n");
      case "input":
        return [head, `${textToken.muted(this.state.message)}`, ""].join("\n");
      case "done":
        return [
          `${highlight.base(this.state.ok ? `✓ ${this.options.providerLabel} connected` : "sign-in failed")}`,
          textToken.muted(this.state.note),
        ].join("\n");
    }
  }

  private async run(): Promise<void> {
    const models = builtinModels();
    const abort = new AbortController();
    const interaction = {
      signal: abort.signal,
      prompt: (prompt: AuthPrompt): Promise<string> =>
        new Promise((resolve, reject) => {
          if (prompt.type === "select") {
            // Auto-pick the device-code option when present (headless-friendly);
            // otherwise the first option.
            const device = prompt.options.find((o) => /device|headless|code/i.test(o.label));
            resolve((device ?? prompt.options[0]!).id);
            return;
          }
          const message = "message" in prompt ? prompt.message : "input";
          this.setState({ phase: "input", message, resolve });
          this.input.focused = true;
          this.input.onSubmit = (value) => {
            this.input.focused = false;
            resolve(value.trim());
          };
          this.input.onEscape = () => reject(new Error("login cancelled"));
        }),
      notify: (event: AuthEvent): void => {
        if (event.type === "device_code") {
          this.setState({ phase: "device", uri: event.verificationUri, code: event.userCode });
          openBrowser(event.verificationUri);
          return;
        }
        if (event.type === "progress") {
          this.setState({ phase: "polling", note: event.message });
        }
      },
    };

    try {
      await models.login(this.options.providerId, "oauth", interaction as never);
      this.setState({ phase: "done", ok: true, note: "credential stored — models available on this lane now" });
      setTimeout(() => this.options.onDone(`${this.options.providerLabel}: connected ✓`), 1400);
    } catch (error) {
      this.setState({
        phase: "done",
        ok: false,
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  handleInput(data: string): void {
    if (this.state.phase === "input") {
      this.input.handleInput(data);
    }
  }

  render(width: number): string[] {
    const body = this.text.render(width);
    if (this.state.phase === "input") {
      const inputLine = this.input.render(width - 4);
      return [...body, ` ${textToken.muted("answer:")} ${inputLine.join("")}`, "", ` ${textToken.dim(renderOverlayFooter())}`];
    }
    return [...body, "", ` ${textToken.dim(renderOverlayFooter())}`];
  }

  invalidate(): void {
    this.text.invalidate();
  }
}
