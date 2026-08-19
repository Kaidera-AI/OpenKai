/**
 * Minimal WebSocket server codec (OK-10 inc 11.1) — dependency-free, just
 * what the hub's attach channel needs: HTTP-upgrade handshake, text frames,
 * masked client frames, ping/pong, close. Server→client frames are unmasked
 * (RFC 6455 §5.1); client→server frames must be masked and are unmasked here.
 * Not a general-purpose WS library — no fragmentation, no binary frames, no
 * per-message deflate (the attach protocol sends small JSON + ANSI chunks).
 */

import { createHash, randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** The upgrade response headers for a valid WS handshake. */
export function handshakeResponseHeaders(secWebSocketKey: string): string {
  const accept = createHash("sha1").update(secWebSocketKey + WS_GUID).digest("base64");
  return [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n");
}

export type WsMessage =
  | { kind: "text"; text: string }
  | { kind: "ping"; payload: Buffer }
  | { kind: "pong"; payload: Buffer }
  | { kind: "close"; code: number; reason: string };

/** Encode a server→client text frame (unmasked). */
export function encodeTextFrame(text: string): Buffer {
  return encodeFrame(0x1, Buffer.from(text, "utf-8"));
}

/** Encode a control frame (ping 0x9 / pong 0xA / close 0x8). */
export function encodeControlFrame(opcode: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  return encodeFrame(opcode, payload);
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/** Incremental decoder for client→server frames (masked). */
export class WsDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  /** Feed bytes; returns every complete message they contained. */
  push(chunk: Buffer): WsMessage[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const out: WsMessage[] = [];
    for (;;) {
      const frame = this.tryReadFrame();
      if (frame === null) break;
      out.push(frame);
    }
    return out;
  }

  private tryReadFrame(): WsMessage | null {
    const buf = this.buffer;
    if (buf.length < 2) return null;
    const opcode = buf[0]! & 0x0f;
    const masked = (buf[1]! & 0x80) !== 0;
    let len = buf[1]! & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < offset + 2) return null;
      len = buf.readUInt16BE(offset);
      offset += 2;
    } else if (len === 127) {
      if (buf.length < offset + 8) return null;
      len = Number(buf.readBigUInt64BE(offset));
      offset += 8;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < offset + maskLen + len) return null;
    let payload = buf.subarray(offset + maskLen, offset + maskLen + len);
    if (masked) {
      const mask = buf.subarray(offset, offset + 4);
      const unmasked = Buffer.alloc(len);
      for (let i = 0; i < len; i += 1) unmasked[i] = payload[i]! ^ mask[i % 4]!;
      payload = unmasked;
    }
    this.buffer = buf.subarray(offset + maskLen + len);
    if (opcode === 0x9) return { kind: "ping", payload };
    if (opcode === 0xa) return { kind: "pong", payload };
    if (opcode === 0x8) {
      const code = len >= 2 ? payload.readUInt16BE(0) : 1000;
      const reason = payload.subarray(len >= 2 ? 2 : 0).toString("utf-8");
      return { kind: "close", code, reason };
    }
    if (opcode === 0x1) return { kind: "text", text: payload.toString("utf-8") };
    // Binary/other opcodes are out of protocol scope — skip the frame.
    return this.tryReadFrame();
  }
}

/** A raw-text WS channel over a socket: send text/control, receive messages. */
export class WsChannel {
  private readonly decoder = new WsDecoder();
  constructor(
    private readonly socket: Duplex,
    private readonly onMessage: (msg: WsMessage) => void,
    private readonly onClose: () => void,
  ) {
    socket.on("data", (chunk: Buffer) => {
      for (const msg of this.decoder.push(chunk)) {
        if (msg.kind === "ping") this.sendRaw(encodeControlFrame(0xa, msg.payload));
        else if (msg.kind === "close") this.close(msg.code, msg.reason);
        else this.onMessage(msg);
      }
    });
    socket.on("close", onClose);
    socket.on("error", onClose);
  }

  send(text: string): void {
    if (!this.socket.destroyed) this.socket.write(encodeTextFrame(text));
  }

  private sendRaw(frame: Buffer): void {
    if (!this.socket.destroyed) this.socket.write(frame);
  }

  close(code = 1000, reason = ""): void {
    if (!this.socket.destroyed) {
      const payload = Buffer.concat([Buffer.from([code >> 8, code & 0xff]), Buffer.from(reason, "utf-8")]);
      this.sendRaw(encodeControlFrame(0x8, payload));
      this.socket.end();
    }
  }
}

/** Unique attachment id for the hello/auth handshake (unpredictable per attach). */
export function attachNonce(): string {
  return randomBytes(8).toString("hex");
}
