/**
 * Hub attach-channel tests (OK-10 inc 11.1): the WS codec round-trips, and a
 * live hub accepts an attach — hello replay (S3), live frames after input
 * (S2), and ro attaches are refused input at the seam (S5).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { randomBytes } from "node:crypto";

import { encodeTextFrame, WsDecoder, handshakeResponseHeaders } from "../dist/ws.js";
import { runHub } from "../dist/hub.js";

// ── Codec ───────────────────────────────────────────────────────────────────

test("ws codec: text frame round-trips through the decoder", () => {
  const payload = JSON.stringify({ type: "hello", sessionId: "s1" });
  const decoder = new WsDecoder();
  // Client frames are masked; wrap the payload the way a browser would.
  const mask = Buffer.from([1, 2, 3, 4]);
  const body = Buffer.from(payload, "utf-8");
  const masked = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i += 1) masked[i] = body[i]! ^ mask[i % 4]!;
  const header = Buffer.from([0x81, 0x80 | body.length]);
  const messages = decoder.push(Buffer.concat([header, mask, masked]));
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], { kind: "text", text: payload });
});

test("ws codec: server frames are unmasked; extended lengths encode", () => {
  const small = encodeTextFrame("hi");
  assert.deepEqual([...small.subarray(0, 2)], [0x81, 2]);
  const big = encodeTextFrame("x".repeat(70000));
  assert.equal(big[1], 127, "64-bit length form");
  const decoder = new WsDecoder();
  // Client-side decoding (default): server frames arrive unmasked.
  const messages = decoder.push(big);
  assert.equal(messages.length, 1);
  assert.equal((messages[0] as { text: string }).text.length, 70000);
});

test("ws codec: the server-side decoder enforces RFC 6455 client rules", () => {
  // Server side (expectMasked): an unmasked client frame is a 1002 protocol
  // error — before this, the hub silently accepted them.
  const strict = new WsDecoder();
  const unmasked = encodeTextFrame("hello"); // FIN|text, len 5, no mask
  const serverDecoder = new WsDecoder(true);
  assert.throws(() => serverDecoder.push(unmasked), /must be masked/);
  // …while the lenient (client-side) decoder still accepts server frames.
  assert.equal(strict.push(encodeTextFrame("hello")).length, 1);

  // Fragmented data frames are rejected (1002), not silently mangled.
  const frag = Buffer.from([0x01, 0x85, 1, 2, 3, 4, 1 ^ 1, 2 ^ 2, 3 ^ 3, 4 ^ 4, 5 ^ 1]);
  assert.throws(() => new WsDecoder(true).push(frag), /fragmented/);

  // A declared payload past the cap is a 1009 — never buffered.
  const huge = Buffer.alloc(10);
  huge[0] = 0x81;
  huge[1] = 0xff; // masked, 64-bit length follows
  huge.writeBigUInt64BE(BigInt(1) << BigInt(40), 2);
  assert.throws(() => new WsDecoder(true).push(huge), /exceeds/);
});

test("ws handshake: accept value follows RFC 6455", () => {
  const headers = handshakeResponseHeaders("dGhlIHNhbXBsZSBub25jZQ==");
  assert.ok(headers.includes("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo="));
});

// ── Live attach flow ────────────────────────────────────────────────────────

interface WsClient {
  send(obj: unknown): void;
  next(timeoutMs?: number): Promise<Record<string, unknown>>;
  close(): void;
}

function wsConnect(port: number, path: string, token: string): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString("base64");
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nAuthorization: Bearer ${token}\r\n\r\n`,
      );
    });
    const decoder = new WsDecoder();
    const queue: Record<string, unknown>[] = [];
    const waiters: ((msg: Record<string, unknown>) => void)[] = [];
    let upgraded = false;
    socket.on("data", (chunk) => {
      if (!upgraded) {
        const text = chunk.toString("latin1");
        if (!text.includes("101")) return reject(new Error(`upgrade refused: ${text.slice(0, 120)}`));
        upgraded = true;
        const rest = chunk.subarray(text.indexOf("\r\n\r\n") + 4);
        if (rest.length > 0) handle(rest);
        resolve({
          send: (obj) => {
            // Client frames MUST be masked — encode manually.
            const body = Buffer.from(JSON.stringify(obj), "utf-8");
            const mask = randomBytes(4);
            const masked = Buffer.alloc(body.length);
            for (let i = 0; i < body.length; i += 1) masked[i] = body[i]! ^ mask[i % 4]!;
            const header = Buffer.alloc(6);
            header[0] = 0x81;
            header[1] = 0x80 | body.length;
            header.writeUInt32BE(mask.readUInt32BE(0), 2);
            socket.write(Buffer.concat([header, masked]));
          },
          next: (timeoutMs = 5000) =>
            new Promise((res, rej) => {
              const timer = setTimeout(() => rej(new Error("ws next() timeout")), timeoutMs);
              if (queue.length > 0) {
                clearTimeout(timer);
                res(queue.shift()!);
                return;
              }
              waiters.push((msg) => {
                clearTimeout(timer);
                res(msg);
              });
            }),
          close: () => socket.destroy(),
        });
        return;
      }
      handle(chunk);
    });
    socket.on("error", reject);
    function handle(chunk: Buffer): void {
      for (const msg of decoder.push(chunk)) {
        if (msg.kind !== "text") continue;
        try {
          const parsed = JSON.parse(msg.text) as Record<string, unknown>;
          const waiter = waiters.shift();
          if (waiter) waiter(parsed);
          else queue.push(parsed);
        } catch {
          // ignore non-JSON
        }
      }
    }
  });
}

test("hub attach: create session, attach ro+rw, input drives the rw attach only (S2/S3/S5)", async () => {
  process.env.OPENKAI_HUB_TOKEN = "test-hub-token";
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "dummy-for-host";
  const controller = new AbortController();
  const port = 18987;
  const hubPromise = runHub({ port, host: "127.0.0.1", signal: controller.signal });
  try {
    // Wait for the hub to listen (bounded).
    let ready = false;
    for (let i = 0; i < 100 && !ready; i += 1) {
      try {
        const health = await fetch(`http://127.0.0.1:${port}/health`);
        ready = health.status === 200;
      } catch {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 25);
        await promise;
      }
    }
    assert.ok(ready, "hub is listening");
    // Create a hosted session over HTTP.
    const created = await fetch(`http://127.0.0.1:${port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-hub-token" },
      body: JSON.stringify({ model: "nvidia/nemotron-3-nano-30b-a3b:free" }),
    });
    assert.equal(created.status, 200);
    const { sessionId } = (await created.json()) as { sessionId: string };
    assert.ok(sessionId.length > 0);

    // Unauthorized attach is refused (401 before any upgrade) — raw socket,
    // because undici refuses to send upgrade headers at all.
    const refusalStatus = await new Promise<number>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write(
          `GET /attach/${sessionId}?mode=ro HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: eA==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        );
      });
      socket.once("data", (chunk) => {
        const statusLine = chunk.toString("latin1").split("\r\n")[0] ?? "";
        const status = Number(statusLine.split(" ")[1]);
        socket.destroy();
        resolve(status);
      });
      socket.on("error", reject);
    });
    assert.equal(refusalStatus, 401);

    // RO attach: hello carries the settled frame (S3).
    const ro = await wsConnect(port, `/attach/${sessionId}?mode=ro&width=80`, "test-hub-token");
    const hello = await ro.next();
    assert.equal(hello["type"], "hello");
    assert.ok(String(hello["frame"]).includes("OpenKai"), "hello replays the boot frame");

    // RO input is ignored at the seam (S5): no frame arrives from it.
    ro.send({ type: "input", data: "x" });

    // RW attach: input lands and produces frames (S2).
    const rw = await wsConnect(port, `/attach/${sessionId}?mode=rw&width=80`, "test-hub-token");
    await rw.next(); // hello
    rw.send({ type: "input", data: "h" });
    rw.send({ type: "input", data: "i" });
    const frame = await rw.next(8000);
    assert.equal(frame["type"], "frame");
    assert.ok(String(frame["data"]).includes("hi"), "the typed text renders in the frame stream");

    ro.close();
    rw.close();
  } finally {
    controller.abort();
    await hubPromise;
    delete process.env.OPENKAI_HUB_TOKEN;
  }
});
