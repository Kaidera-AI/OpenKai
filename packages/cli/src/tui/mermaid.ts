/**
 * Mermaid → ASCII inline rendering, lifted from pi-coding-agent
 * (`packages/coding-agent/src/modes/interactive/components/mermaid.ts`,
 * MIT © Mario Zechner / earendil-works). Adapted for OpenKai's theme tokens;
 * semantics unchanged: replace mermaid code fences with themed Unicode
 * diagrams when they fit the width, leave the raw fence otherwise.
 */

import { Marked, type Token } from "@earendil-works/pi-tui";
import { render, type MermaidArt, type Span } from "grok-mermaid";

const parser = new Marked();

const isMermaid = (token: Token): boolean =>
  token.type === "code" &&
  (token as { lang?: string }).lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() === "mermaid";

/** Encode one diagram row as an inline code span (preserves spacing/box chars). */
function codeSpan(line: string): string {
  const content = line || " ";
  const longest = Math.max(0, ...Array.from(content.matchAll(/`+/g), (m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  const padding = content.startsWith("`") || content.endsWith("`") ? " " : "";
  return `${fence}${padding}${content}${padding}${fence}`;
}

export interface MermaidTheme {
  borderMuted: (text: string) => string;
  text: (text: string) => string;
  accent: (text: string) => string;
  muted: (text: string) => string;
  bold: (text: string) => string;
  warning: (text: string) => string;
}

function styleSpan(span: Span, theme: MermaidTheme): string {
  switch (span.cls) {
    case "border":
      return theme.borderMuted(span.text);
    case "text":
      return theme.text(span.text);
    case "edge":
      return theme.accent(span.text);
    case "edgeLabel":
      return theme.muted(span.text);
    case "title":
      return theme.accent(theme.bold(span.text));
    case "none":
      return span.text;
    default:
      return span.text;
  }
}

function themedLines(art: MermaidArt, theme: MermaidTheme): string[] {
  return art.styled.map((row) => row.map((span) => styleSpan(span, theme)).join(""));
}

/**
 * Replace top-level mermaid fences with rendered Unicode diagrams.
 * `streaming` skips render until the block settles (a half-written diagram
 * wastes a full render per delta).
 */
export function renderMermaidBlocks(markdown: string, availableWidth: number, theme: MermaidTheme, streaming = false): string {
  return parser
    .lexer(markdown)
    .map((token) => {
      if (!isMermaid(token)) return token.raw;
      if (streaming) return token.raw;
      const art = render((token as { text: string }).text);
      if (!art || art.width > availableWidth) return token.raw;
      if (art.warnings.length > 0) {
        const suffix = art.warnings.length > 1 ? ` (+${art.warnings.length - 1} more)` : "";
        return `${token.raw}\n${codeSpan(theme.warning(`Mermaid diagram not rendered: ${art.warnings[0]}${suffix}`))}  \n`;
      }
      return `${themedLines(art, theme).map(codeSpan).join("  \n")}\n`;
    })
    .join("");
}
