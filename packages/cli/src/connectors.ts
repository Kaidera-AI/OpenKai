/**
 * Chat connectors (Cline pattern, E015): normalise Slack / Telegram webhook
 * payloads into plain prompt text for the hub. `openkai bridge --listen`
 * runs a loopback HTTP server; each request must carry the hub bearer token
 * (the webhook sender is configured with the same secret) so an open port
 * can never inject prompts.
 */

/** Extract the prompt text from a Slack/Telegram/generic payload, or undefined. */
export function normaliseConnectorPayload(raw: unknown): string | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  // Slack event_callback: { type: "event_callback", event: { type: "message", text } }
  const event = obj["event"];
  if (event && typeof event === "object") {
    const text = (event as Record<string, unknown>)["text"];
    if (typeof text === "string" && text.trim().length > 0) return text.trim();
  }

  // Telegram update: { message: { text } } (or channel_post / edited_message)
  for (const key of ["message", "channel_post", "edited_message"]) {
    const msg = obj[key];
    if (msg && typeof msg === "object") {
      const text = (msg as Record<string, unknown>)["text"];
      if (typeof text === "string" && text.trim().length > 0) return text.trim();
    }
  }

  // Generic: { text }
  if (typeof obj["text"] === "string" && (obj["text"] as string).trim().length > 0) {
    return (obj["text"] as string).trim();
  }
  return undefined;
}
