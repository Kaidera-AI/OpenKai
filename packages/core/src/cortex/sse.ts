import type { SseFrame } from "./types.js";

/**
 * Transport-level overflow: the peer sent a line or frame past the cap. The
 * client's bounded backoff treats this like any transport failure — the
 * alternative is unbounded memory growth on a hostile or stuck peer (ren
 * review).
 */
export class SseOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SseOverflowError";
  }
}

/** Cap on the unparsed line buffer and on one frame's accumulated data. */
const MAX_BUFFER_CHARS = 1024 * 1024; // 1 MiB

/**
 * Incremental text/event-stream parser.
 *
 * Consumes a byte stream (fetch response body) and yields parsed frames.
 * Handles the Cortex wire shape: `event:`/`id:`/`data:` frames, multi-line
 * data, and `: comment` keep-alives. LF-only splitting is deliberate (the
 * pi RPC framing gotcha: splitting on Unicode line separators corrupts JSON
 * payloads). Both the line buffer and per-frame data accumulation are capped
 * at 1 MiB — overflow raises {@link SseOverflowError}.
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
  let dataChars = 0;

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
      dataChars = 0;
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
        else if (field === "data") {
          dataChars += value.length;
          if (dataChars > MAX_BUFFER_CHARS) {
            throw new SseOverflowError("SSE frame data exceeded 1 MiB");
          }
          dataLines.push(value);
        }
        // Unknown fields are ignored per the SSE spec.
      }
      if (buffer.length > MAX_BUFFER_CHARS) {
        throw new SseOverflowError("SSE line buffer exceeded 1 MiB without a newline");
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
