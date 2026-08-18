/**
 * Shared HTTP primitives for the loopback listeners (hub + bridge). Extracted
 * at the K3 review: the bridge `--listen` server re-implemented hub auth
 * weaker (plain compare, no cap, no Host check). One implementation now —
 * a listener is only as hardened as its weakest sibling.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/** Request bodies are prompts, not files — 1 MiB is generous. */
export const MAX_BODY_BYTES = 1024 * 1024;

export class BodyTooLargeError extends Error {
  override readonly name = "BodyTooLargeError";
}

/**
 * Read a request body with a hard size cap. Drains (never destroys the
 * socket) on overflow so the 413 can flush; rejects on client error/close so
 * an abort mid-body never parks the handler (K3).
 */
export function readBody(req: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const chunks: Buffer[] = [];
  let size = 0;
  let settled = false;
  req.on("data", (c: Buffer) => {
    size += c.length;
    if (size > maxBytes) {
      if (!settled) {
        settled = true;
        reject(new BodyTooLargeError(`request body exceeds ${maxBytes} bytes`));
      }
      return; // keep draining without buffering
    }
    chunks.push(c);
  });
  req.on("end", () => {
    if (!settled) {
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf-8"));
    }
  });
  const fail = (): void => {
    if (!settled) {
      settled = true;
      reject(new Error("request closed mid-body"));
    }
  };
  req.on("error", fail);
  req.on("close", fail);
  return promise;
}

/** Hash a token once; compare presented headers against the digest. */
export function bearerDigest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** Timing-safe bearer compare: both sides hashed to fixed length first. */
export function bearerMatches(header: string | undefined, tokenHash: Buffer): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const presented = createHash("sha256").update(header.slice("Bearer ".length)).digest();
  return timingSafeEqual(presented, tokenHash);
}

/** The loopback bind set every listener accepts. */
export const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "::1"];

/** True when the host is in the loopback set. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.includes(host);
}

/** Host-header allowlist for a bound port (DNS-rebinding guard). */
export function allowedHostsFor(port: number): Record<string, true> {
  return {
    [`127.0.0.1:${port}`]: true,
    [`localhost:${port}`]: true,
    [`[::1]:${port}`]: true,
  };
}

/** Bracket an IPv6 literal for URL construction. */
export function urlHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}
