/**
 * `/export` — self-contained HTML transcript of the current session (E017
 * dossier pick 8, pi's `exportToHtml` adapted). One file, inline CSS, no
 * external references, no template-dir machinery (pi's `getExportTemplateDir`
 * handles bun-binary layouts we don't have). Theme colours come from the
 * same 256-colour indices as theme.ts's DARK table, converted to hex —
 * the export reads like the terminal it came from.
 *
 * Tool calls render as preformatted blocks (pi's ToolHtmlRenderer extension
 * point is skipped per the dossier). All model/session text is HTML-escaped
 * at the single render seam — an export must never carry live markup.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Entry } from "@kaidera/openkai-core";

/** Convert an xterm-256 palette index to `#rrggbb` (pure — exported for tests). */
export function xterm256ToHex(n: number): string {
  // 0-15: the base ANSI table (xterm defaults).
  const BASE16 = [
    "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
    "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
  ];
  if (n < 16) return BASE16[n]!;
  const hex = (v: number): string => v.toString(16).padStart(2, "0");
  if (n < 232) {
    // 16-231: the 6×6×6 colour cube.
    const idx = n - 16;
    const level = (v: number): number => (v === 0 ? 0 : 55 + v * 40);
    const r = level(Math.floor(idx / 36));
    const g = level(Math.floor((idx % 36) / 6));
    const b = level(idx % 6);
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  // 232-255: the greyscale ramp.
  const v = 8 + (n - 232) * 10;
  return `#${hex(v)}${hex(v)}${hex(v)}`;
}

/**
 * Export palette — the SAME indices as theme.ts's DARK table (theme.ts keeps
 * them module-private; keep these in lockstep with it).
 */
const EXPORT_COLOURS = {
  background: 234, // surface1 — near-black panel
  surface: 237, // surface2 — raised block
  text: 252, // default foreground
  muted: 244, // secondary text
  accent: 39, // cyan highlight
  danger: 124, // red accent
  border: 241, // tool card border
  attention: 220, // amber
} as const;

/** Escape text for HTML body/attribute contexts (the single escape seam). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One rendered transcript block (discriminated by role). */
interface HtmlBlock {
  role: "user" | "assistant" | "tool" | "compaction";
  html: string;
}

/** Extract the text of one message's content parts (string or part array). */
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: unknown[] = content;
  const texts: string[] = [];
  for (const part of parts) {
    if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") {
      texts.push(part.text);
    }
  }
  return texts.join("");
}

/** Render one message into HTML blocks (tool calls become preformatted blocks). */
function messageBlocks(message: AgentMessage): HtmlBlock[] {
  if (message.role === "toolResult") {
    return [
      {
        role: "tool",
        html: `<div class="tool"><span class="tool-name">${escapeHtml(message.toolName)}</span> result<pre>${escapeHtml(messageText(message.content).slice(0, 4000))}</pre></div>`,
      },
    ];
  }
  const blocks: HtmlBlock[] = [];
  if (message.role === "assistant") {
    for (const part of message.content) {
      if (part.type !== "toolCall") continue;
      const args = JSON.stringify(part.arguments ?? {}, null, 2) ?? "{}";
      blocks.push({
        role: "tool",
        html: `<div class="tool"><span class="tool-name">${escapeHtml(part.name)}</span><pre>${escapeHtml(args.slice(0, 4000))}</pre></div>`,
      });
    }
  }
  if (message.role !== "user" && message.role !== "assistant") {
    // Custom message kinds (bash-execution, branch/compaction summaries, …)
    // carry no transcript text — the compaction ENTRY renderer covers those.
    return blocks;
  }
  const text = messageText(message.content);
  if (text.trim().length > 0) {
    blocks.push({
      role: message.role === "assistant" ? "assistant" : "user",
      html: `<div class="msg ${message.role === "assistant" ? "assistant" : "user"}"><div class="who">${message.role === "assistant" ? "assistant" : "you"}</div><div class="body">${escapeHtml(text)}</div></div>`,
    });
  }
  return blocks;
}

/** Options for {@link exportSessionToHtml}. */
export interface ExportHtmlOptions {
  sessionId: string;
  /** Display name from /name (the `session_name` custom entry), if any. */
  name?: string;
  /** The session entries (store.readEntries()). */
  entries: Entry[];
  /** Export time (epoch ms; default now). */
  exportedAt?: number;
}

/**
 * Render the session to one self-contained HTML document (inline CSS, no
 * scripts, no external references).
 */
export function exportSessionToHtml(options: ExportHtmlOptions): string {
  const c = (n: number): string => xterm256ToHex(n);
  const exportedAt = new Date(options.exportedAt ?? Date.now());
  const blocks: HtmlBlock[] = [];
  for (const entry of options.entries) {
    if (entry.type === "message") {
      blocks.push(...messageBlocks(entry.message));
    } else if (entry.type === "compaction") {
      blocks.push({
        role: "compaction",
        html: `<div class="compaction">context compacted — ${escapeHtml(String(entry.tokensBefore))} tokens before<pre>${escapeHtml(entry.summary)}</pre></div>`,
      });
    }
  }
  const title = options.name?.trim() ? options.name.trim() : `session ${options.sessionId.slice(0, 8)}`;
  const body = blocks.length > 0 ? blocks.map((b) => b.html).join("\n") : `<p class="empty">(empty session)</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenKai — ${escapeHtml(title)}</title>
<style>
:root { color-scheme: dark; }
body { background: ${c(EXPORT_COLOURS.background)}; color: ${c(EXPORT_COLOURS.text)};
  font: 14px/1.55 -apple-system, "SF Mono", ui-monospace, Menlo, monospace;
  max-width: 860px; margin: 0 auto; padding: 32px 20px; }
header { border-bottom: 1px solid ${c(EXPORT_COLOURS.border)}; margin-bottom: 24px; padding-bottom: 12px; }
header h1 { color: ${c(EXPORT_COLOURS.accent)}; font-size: 18px; margin: 0 0 4px; }
header .meta { color: ${c(EXPORT_COLOURS.muted)}; font-size: 12px; }
.msg { margin: 14px 0; padding: 10px 14px; background: ${c(EXPORT_COLOURS.surface)}; border-radius: 6px; }
.msg .who { color: ${c(EXPORT_COLOURS.muted)}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
.msg.user .who { color: ${c(EXPORT_COLOURS.attention)}; }
.msg .body { white-space: pre-wrap; word-break: break-word; }
.tool { margin: 8px 0 8px 12px; padding: 8px 12px; border-left: 3px solid ${c(EXPORT_COLOURS.border)}; }
.tool-name { color: ${c(EXPORT_COLOURS.accent)}; }
.tool pre, .compaction pre { color: ${c(EXPORT_COLOURS.muted)}; white-space: pre-wrap; word-break: break-word;
  font-size: 12px; margin: 6px 0 0; }
.compaction { margin: 18px 0; padding: 8px 12px; border-left: 3px solid ${c(EXPORT_COLOURS.attention)};
  color: ${c(EXPORT_COLOURS.attention)}; font-size: 12px; }
.empty { color: ${c(EXPORT_COLOURS.muted)}; }
footer { margin-top: 32px; color: ${c(EXPORT_COLOURS.muted)}; font-size: 11px;
  border-top: 1px solid ${c(EXPORT_COLOURS.border)}; padding-top: 10px; }
</style>
</head>
<body>
<header>
<h1>${escapeHtml(title)}</h1>
<div class="meta">OpenKai session ${escapeHtml(options.sessionId)} · exported ${escapeHtml(exportedAt.toISOString())} · ${blocks.length} blocks</div>
</header>
${body}
<footer>exported by openkai /export — self-contained transcript</footer>
</body>
</html>
`;
}
