import type { SseFrame } from "./types.js";

/**
 * Incremental text/event-stream parser.
 *
 * Consumes a byte stream (fetch response body) and yields parsed frames.
 * Handles the Cortex wire shape: `event:`/`id:`/`data:` frames, multi-line
 * data, and `: comment` keep-alives. LF-only splitting is deliberate (the
 * pi RPC framing gotcha: splitting on Unicode line separators corrupts JSON
 * payloads).
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName: string | null = null;
  let eventId: string | null = null;
  let dataLines: string[] = [];

  const flush = (): SseFrame | null => {
    if (dataLines.length > 0) {
      const frame: SseFrame = {
        kind: "frame",
        event: eventName,
        id: eventId,
        data: dataLines.join("\n"),
      };
      eventName = null;
      eventId = null;
      dataLines = [];
      return frame;
    }
    eventName = null;
    eventId = null;
    return null;
  };

  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        // Tolerate CRLF senders without splitting on Unicode separators.
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        if (line === "") {
          const frame = flush();
          if (frame) yield frame;
          continue;
        }
        if (line.startsWith(":")) {
          yield { kind: "comment", comment: line.slice(1).trimStart() };
          continue;
        }
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const rawValue = colon === -1 ? "" : line.slice(colon + 1);
        const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
        if (field === "event") eventName = value;
        else if (field === "id") eventId = value;
        else if (field === "data") dataLines.push(value);
        // Unknown fields are ignored per the SSE spec.
      }
    }
    // Stream ended: flush any pending frame.
    const tail = flush();
    if (tail) yield tail;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
