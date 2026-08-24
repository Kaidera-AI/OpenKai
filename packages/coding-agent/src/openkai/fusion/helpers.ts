/**
 * Local helpers replacing pi-0.84 exports that v18 dropped:
 * `contentText` (content blocks -> text) and `uuidv7` (time-ordered run ids).
 */

import type { TextContent } from "@oh-my-pi/pi-ai";

/** Extract the text of a content-block list (the v18 surface dropped the helper). */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Array<TextContent | { type: string }>)
    .filter((p): p is TextContent => typeof p === "object" && p !== null && (p as { type?: string }).type === "text")
    .map((p) => p.text)
    .join("");
}

/** Time-ordered run id (uuidv7's role in the fusion log: sortable filenames). */
export function newRunId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}
