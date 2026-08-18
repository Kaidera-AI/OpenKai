/**
 * Chat connectors (Cline pattern, E015): normalise Slack / Telegram webhook
 * payloads into plain prompt text for the hub. `openkai bridge --listen`
 * runs a loopback HTTP server; each request must carry the hub bearer token
 * (the webhook sender is configured with the same secret) so an open port
 * can never inject prompts.
 *
 * K3 hardening: bot/subtype events are dropped (a connector that posts
 * replies into the channel must never consume its own output as prompts —
 * the self-loop); Slack's url_verification handshake is classified so the
 * bridge can answer it; event/update ids are surfaced for delivery dedup
 * (Slack retries any ack slower than 3s).
 */

/** What a webhook payload means to the bridge. */
export type ConnectorEvent =
  /** Slack url_verification handshake — answer with the challenge, no auth. */
  | { kind: "challenge"; challenge: string }
  /** A real prompt; eventId feeds the bridge's delivery dedup. */
  | { kind: "prompt"; text: string; eventId?: string }
  /** Drop silently: bot messages, subtypes, empty/non-prompt payloads. */
  | { kind: "ignore" };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textOf(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** Classify a Slack/Telegram/generic webhook payload. */
export function classifyConnectorPayload(raw: unknown): ConnectorEvent {
  const obj = asRecord(raw);
  if (!obj) return { kind: "ignore" };

  // Slack Events API handshake.
  if (obj["type"] === "url_verification" && typeof obj["challenge"] === "string") {
    return { kind: "challenge", challenge: obj["challenge"] };
  }

  // Slack event_callback: { type, event_id, event: { type: "message", text, … } }
  const event = asRecord(obj["event"]);
  if (event) {
    // Bot output and subtyped events (edits, joins, bot_message, …) are not
    // prompts — this is the self-loop guard.
    if (typeof event["bot_id"] === "string") return { kind: "ignore" };
    if (typeof event["subtype"] === "string") return { kind: "ignore" };
    const text = textOf(event, ["text"]);
    if (!text) return { kind: "ignore" };
    const eventId = typeof obj["event_id"] === "string" ? obj["event_id"] : undefined;
    return { kind: "prompt", text, ...(eventId !== undefined ? { eventId } : {}) };
  }

  // Telegram update: { update_id, message|channel_post|edited_message: { text|caption } }
  for (const key of ["message", "channel_post", "edited_message"] as const) {
    const msg = asRecord(obj[key]);
    if (msg) {
      const text = textOf(msg, ["text", "caption"]);
      if (!text) return { kind: "ignore" };
      const updateId = obj["update_id"];
      const eventId = typeof updateId === "number" || typeof updateId === "string" ? String(updateId) : undefined;
      return { kind: "prompt", text, ...(eventId !== undefined ? { eventId } : {}) };
    }
  }

  // Generic: { text }
  const text = textOf(obj, ["text"]);
  if (text) return { kind: "prompt", text };
  return { kind: "ignore" };
}

/** Extract the prompt text from a payload, or undefined (legacy shape). */
export function normaliseConnectorPayload(raw: unknown): string | undefined {
  const event = classifyConnectorPayload(raw);
  return event.kind === "prompt" ? event.text : undefined;
}
