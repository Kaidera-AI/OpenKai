import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type StatuslineChip,
  readConfigFile,
  writeConfigFile,
  readMcpServers,
  writeMcpServers,
  readStatuslineChips,
  writeStatuslineChips,
  STATUSLINE_CHIPS,
  DEFAULT_STATUSLINE_CHIPS,
  type McpServerEntry,
} from "../dist/config.js";
import { mkdtempSync } from "node:fs";
import { StatusLine, defaultStatusState } from "../dist/tui/status.js";
import { runSkillsList, runSkillsAdd, runSkillsRemove, runSkillsBind } from "../dist/skills.js";
import { runMcpAdd, runMcpRemove, runMcpList, runMcpTest } from "../dist/mcp.js";
import { runStatusline } from "../dist/statusline.js";

/**
 * E002 Inc 05 capability-management tests — round-trip coverage for:
 *  1. `openkai skills` list/add/remove/bind against the Cortex skill registry
 *  2. `openkai mcp` add/remove/list against ~/.openkai/config.json
 *  3. `openkai statusline` chip config (set/hide/show/reset) applied to StatusLine
 *
 * All filesystem operations run against `OPENKAI_HOME` set to a temp dir — no
 * real `~/.openkai` mutation. The skills tests use a fake fetch (injectable
 * CortexClient) — no real Cortex API calls.
 */


// ── Config helpers (OPENKAI_HOME isolation) ──────────────────────────────────


let tempHome = "";

function setupTempHome(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ok-test-"));
  process.env.OPENKAI_HOME = dir;
  return dir;
}


describe("Inc 05 capability management", { concurrency: 1 }, () => {
test("config: readConfigFile returns {} when file missing", () => {
  setupTempHome();
  assert.deepEqual(readConfigFile(), {});
});

test("config: writeConfigFile then readConfigFile round-trips", () => {
  setupTempHome();
  writeConfigFile({ foo: "bar", nested: { a: 1 } });
  const result = readConfigFile();
  assert.equal(result["foo"], "bar");
  assert.deepEqual(result["nested"], { a: 1 });
});

// ── MCP server config round-trip ────────────────────────────────────────────

test("mcp config: readMcpServers returns {} when no servers", () => {
  setupTempHome();
  assert.deepEqual(readMcpServers(), {});
});

test("mcp config: add then list then remove round-trip", () => {
  setupTempHome();
  const servers = readMcpServers();

  // Add stdio server
  const stdio: McpServerEntry = { name: "local-srv", command: "node", args: ["server.js"] };
  servers["local-srv"] = stdio;
  writeMcpServers(servers);

  const after1 = readMcpServers();
  assert.equal(Object.keys(after1).length, 1);
  assert.equal(after1["local-srv"]?.command, "node");
  assert.deepEqual(after1["local-srv"]?.args, ["server.js"]);

  // Add URL server
  const after1b = readMcpServers();
  const url: McpServerEntry = { name: "remote-srv", url: "http://localhost:3001/sse" };
  after1b["remote-srv"] = url;
  writeMcpServers(after1b);

  const after2 = readMcpServers();
  assert.equal(Object.keys(after2).length, 2);
  assert.equal(after2["remote-srv"]?.url, "http://localhost:3001/sse");

  // Remove one
  delete after2["local-srv"];
  writeMcpServers(after2);
  const after3 = readMcpServers();
  assert.equal(Object.keys(after3).length, 1);
  assert.equal(after3["remote-srv"]?.url, "http://localhost:3001/sse");
  assert.equal(after3["local-srv"], undefined);
});

test("mcp config: env vars round-trip", () => {
  setupTempHome();
  const servers: Record<string, McpServerEntry> = {};
  servers["with-env"] = {
    name: "with-env",
    command: "python",
    args: ["-m", "mcp_server"],
    env: { API_KEY: "secret123", DEBUG: "true" },
  };
  writeMcpServers(servers);
  const result = readMcpServers();
  assert.deepEqual(result["with-env"]?.env, { API_KEY: "secret123", DEBUG: "true" });
});

test("mcp config: preserves other config keys on write", () => {
  setupTempHome();
  writeConfigFile({ onboarded: true, features: { tips: true } });
  writeMcpServers({ "srv": { name: "srv", command: "echo" } });
  const config = readConfigFile();
  assert.equal(config["onboarded"], true);
  assert.deepEqual(config["mcpServers"], { "srv": { name: "srv", command: "echo" } });
});

// ── Statusline chip config round-trip ────────────────────────────────────────

test("statusline config: defaults to all chips in canonical order", () => {
  setupTempHome();
  const chips = readStatuslineChips();
  assert.deepEqual(chips, DEFAULT_STATUSLINE_CHIPS);
  assert.deepEqual([...DEFAULT_STATUSLINE_CHIPS], ["brand", "agent", "provider", "git", "persist", "session", "state", "ctx", "tokens", "model"]);
});

test("statusline config: set custom chip order round-trips", () => {
  setupTempHome();
  writeStatuslineChips(["model", "agent", "state"] as StatuslineChip[]);
  const chips = readStatuslineChips();
  assert.deepEqual(chips, ["model", "agent", "state"]);
});

test("statusline config: hide/show round-trip", () => {
  setupTempHome();
  // Start from default, hide 'tokens'
  writeStatuslineChips([...DEFAULT_STATUSLINE_CHIPS] as StatuslineChip[]);
  let chips = readStatuslineChips();
  const withoutTokens = chips.filter((c) => c !== "tokens");
  writeStatuslineChips(withoutTokens);
  chips = readStatuslineChips();
  assert.ok(!chips.includes("tokens"));
  assert.equal(chips.length, DEFAULT_STATUSLINE_CHIPS.length - 1);

  // Show it back (at end)
  const withTokens: StatuslineChip[] = [...chips, "tokens"];
  writeStatuslineChips(withTokens);
  chips = readStatuslineChips();
  assert.ok(chips.includes("tokens"));
  assert.equal(chips.length, DEFAULT_STATUSLINE_CHIPS.length);
  assert.equal(chips[chips.length - 1], "tokens");
});

test("statusline config: reset restores defaults", () => {
  setupTempHome();
  writeStatuslineChips(["model"] as StatuslineChip[]);
  let chips = readStatuslineChips();
  assert.deepEqual(chips, ["model"]);
  writeStatuslineChips([...DEFAULT_STATUSLINE_CHIPS] as StatuslineChip[]);
  chips = readStatuslineChips();
  assert.deepEqual(chips, DEFAULT_STATUSLINE_CHIPS);
});

test("statusline config: invalid chips are filtered out", () => {
  setupTempHome();
  // Write a config with an invalid chip name
  writeConfigFile({ statusline: { chips: ["agent", "bogus", "model"] } });
  const chips = readStatuslineChips();
  assert.deepEqual(chips, ["agent", "model"]);
});

test("statusline config: empty chip list falls back to defaults", () => {
  setupTempHome();
  writeConfigFile({ statusline: { chips: [] } });
  const chips = readStatuslineChips();
  assert.deepEqual(chips, DEFAULT_STATUSLINE_CHIPS);
});

test("statusline config: STATUSLINE_CHIPS constant matches the spec set", () => {
  assert.deepEqual([...STATUSLINE_CHIPS], ["brand", "agent", "model", "session", "tokens", "persist", "provider", "state", "git", "ctx"]);
});

// ── StatusLine TUI component reads chip config ───────────────────────────────


function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("statusline TUI: renders all chips by default", () => {
  setupTempHome();
  const state = defaultStatusState("test-model", "abc12345", "local");
  state.provider = "openrouter";
  const line = new StatusLine(state);
  const rendered = stripAnsi(line.render(120)[0] ?? "");
  // All 7 chips should appear
  assert.ok(rendered.includes("OPENKAI"), "agent chip");
  assert.ok(rendered.includes("test-model"), "model chip");
  assert.ok(rendered.includes("abc12345"), "session chip");
  assert.ok(rendered.includes("—"), "tokens chip (idle = —)");
  assert.ok(rendered.includes("p:local"), "persist chip");
  assert.ok(rendered.includes("openrouter"), "provider chip");
  assert.ok(rendered.includes("idle"), "state chip");
});

test("statusline TUI: two-sided layout — model sits right, chips configurable", () => {
  setupTempHome();
  writeStatuslineChips(["model", "state", "agent"]);
  const state = defaultStatusState("my-model", "sess1234", "local");
  state.provider = "nvidia";
  const line = new StatusLine(state);
  const rendered = stripAnsi(line.render(120)[0] ?? "");
  // omp's two-sided contract: agent/state on the left, model right-aligned.
  const modelIdx = rendered.indexOf("my-model");
  const agentIdx = rendered.indexOf("OPENKAI");
  assert.ok(modelIdx >= 0 && agentIdx >= 0);
  assert.ok(modelIdx > agentIdx, "model should sit right of the left-side chips");
  // provider should NOT appear (not in custom config)
  assert.ok(!rendered.includes("nvidia"), "provider should be hidden");
  // session should NOT appear
  assert.ok(!rendered.includes("sess1234"), "session should be hidden");
});

test("statusline TUI: hides chips not in config", () => {
  setupTempHome();
  writeStatuslineChips(["agent", "state"]);
  const state = defaultStatusState("hidden-model", "hidden-sess", "local");
  const line = new StatusLine(state);
  const rendered = stripAnsi(line.render(120)[0] ?? "");
  assert.ok(rendered.includes("OPENKAI"), "agent chip present");
  assert.ok(rendered.includes("idle"), "state chip present");
  assert.ok(!rendered.includes("hidden-model"), "model should be hidden");
  assert.ok(!rendered.includes("hidden-sess"), "session should be hidden");
  assert.ok(!rendered.includes("p:local"), "persist should be hidden");
});

test("statusline TUI: update() re-reads chip config", () => {
  setupTempHome();
  const state = defaultStatusState("m1", "s1", "local");
  const line = new StatusLine(state);
  let rendered = stripAnsi(line.render(120)[0] ?? "");
  assert.ok(rendered.includes("m1"), "model visible by default");

  // Change config and call update
  writeStatuslineChips(["agent", "state"]);
  line.update({ ...state });
  rendered = stripAnsi(line.render(120)[0] ?? "");
  assert.ok(!rendered.includes("m1"), "model now hidden after config change");
});

// ── Skills frontmatter parser + slugify ──────────────────────────────────────

// Test the skills module's internal helpers via the public add/list/remove
// functions with a fake CortexClient. We can't import private functions, but
// we can test the full round-trip with a mocked fetch.


/** A fake fetch that records calls and returns canned responses. */
function makeFakeFetch(): {
  fetch: typeof fetch;
  calls: { method: string; path: string; body?: unknown }[];
} {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const path = url.replace("http://localhost:8501", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, path, body });

    // Canned responses
    if (method === "GET" && path === "/skills") {
      return new Response(JSON.stringify({ skills: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "POST" && path === "/skills") {
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "DELETE" && path.startsWith("/skills/")) {
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "POST" && path.endsWith("/bind")) {
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200 });
  };
  return { fetch: fakeFetch as typeof fetch, calls };
}

test("skills list: empty registry returns 0 and prints message", async () => {
  setupTempHome();
  const fake = makeFakeFetch();
  // Inject fake fetch via CORTEX_API_URL + env — but we need to pass it through.
  // Since skills.ts uses CortexClient which reads from env, we set the env.
  const origFetch = globalThis.fetch;
  globalThis.fetch = fake.fetch;
  try {
    const exitCode = await runSkillsList({ project: "test-proj", api: "http://localhost:8501" });
    assert.equal(exitCode, 0);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0]!.method, "GET");
    assert.equal(fake.calls[0]!.path, "/skills");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("skills add: parses SKILL.md frontmatter and registers", async () => {
  setupTempHome();
  const tempSkillDir = await mkdtemp(path.join(tmpdir(), "skill-"));
  const skillContent = `---
name: My Test Skill
description: A test skill for round-trip testing
scope: project
---

# My Test Skill

This is the body of the skill.
`;
  await writeFile(path.join(tempSkillDir, "SKILL.md"), skillContent);

  const fake = makeFakeFetch();
  const origFetch = globalThis.fetch;
  globalThis.fetch = fake.fetch;
  try {
    const exitCode = await runSkillsAdd({ source: tempSkillDir, project: "test-proj", api: "http://localhost:8501" });
    assert.equal(exitCode, 0);
    // Should have called POST /skills
    const postCalls = fake.calls.filter((c) => c.method === "POST" && c.path === "/skills");
    assert.equal(postCalls.length, 1);
    const body = postCalls[0]!.body as Record<string, unknown>;
    assert.equal(body["skill_slug"], "my-test-skill");
    assert.equal(body["scope"], "project");
    assert.equal(body["name"], "My Test Skill");
    assert.equal(body["description"], "A test skill for round-trip testing");
    assert.ok(body["body_hash"], "body_hash should be set");
    assert.ok(body["body_ref"], "body_ref should be set");

    // Should have copied the skill to .agents/skills/<slug>/
    const copiedPath = path.join(process.cwd(), ".agents", "skills", "my-test-skill", "SKILL.md");
    assert.ok(existsSync(copiedPath), "skill should be copied to .agents/skills/");
  } finally {
    globalThis.fetch = origFetch;
    // Clean up .agents/skills
    await rm(path.join(process.cwd(), ".agents", "skills", "my-test-skill"), { recursive: true, force: true }).catch(() => {});
    await rm(tempSkillDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("skills remove: deletes from registry and local folder", async () => {
  setupTempHome();
  // Create a local skill folder to remove
  const skillDir = path.join(process.cwd(), ".agents", "skills", "to-remove");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "# to remove");

  const fake = makeFakeFetch();
  const origFetch = globalThis.fetch;
  globalThis.fetch = fake.fetch;
  try {
    const exitCode = await runSkillsRemove({ slug: "to-remove", project: "test-proj", api: "http://localhost:8501" });
    assert.equal(exitCode, 0);
    // Should have called DELETE /skills/to-remove
    const deleteCalls = fake.calls.filter((c) => c.method === "DELETE");
    assert.equal(deleteCalls.length, 1);
    assert.equal(deleteCalls[0]!.path, "/skills/to-remove");
    // Local folder should be gone
    assert.ok(!existsSync(skillDir), "local folder should be removed");
  } finally {
    globalThis.fetch = origFetch;
    await rm(skillDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("skills bind: binds a skill to a role", async () => {
  setupTempHome();
  const fake = makeFakeFetch();
  const origFetch = globalThis.fetch;
  globalThis.fetch = fake.fetch;
  try {
    const exitCode = await runSkillsBind({
      slug: "my-skill",
      to: "full-stack-developer",
      kind: "role",
      project: "test-proj",
      api: "http://localhost:8501",
    });
    assert.equal(exitCode, 0);
    const bindCalls = fake.calls.filter((c) => c.method === "POST" && c.path.endsWith("/bind"));
    assert.equal(bindCalls.length, 1);
    assert.equal(bindCalls[0]!.path, "/skills/my-skill/bind");
    const body = bindCalls[0]!.body as Record<string, unknown>;
    assert.equal(body["subject_kind"], "role");
    assert.equal(body["subject"], "full-stack-developer");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("skills add: missing source returns exit 1", async () => {
  setupTempHome();
  const exitCode = await runSkillsAdd({ source: "/nonexistent/path", project: "test-proj" });
  assert.equal(exitCode, 1);
});

test("skills add: missing SKILL.md returns exit 2", async () => {
  setupTempHome();
  const tempDir = await mkdtemp(path.join(tmpdir(), "no-skill-"));
  const exitCode = await runSkillsAdd({ source: tempDir, project: "test-proj" });
  assert.equal(exitCode, 2);
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

// ── MCP CLI commands round-trip ─────────────────────────────────────────────


test("mcp add: stdio server round-trip (add → list → remove)", async () => {
  setupTempHome();
  // Add
  let exitCode = await runMcpAdd({ name: "test-srv", command: "node", args: "server.js --port 3000" });
  assert.equal(exitCode, 0);
  const servers = readMcpServers();
  assert.equal(servers["test-srv"]?.command, "node");
  assert.deepEqual(servers["test-srv"]?.args, ["server.js", "--port", "3000"]);

  // Remove
  exitCode = await runMcpRemove({ name: "test-srv" });
  assert.equal(exitCode, 0);
  assert.equal(readMcpServers()["test-srv"], undefined);
});

test("mcp add: URL server round-trip", async () => {
  setupTempHome();
  const exitCode = await runMcpAdd({ name: "remote", url: "http://localhost:3001/sse" });
  assert.equal(exitCode, 0);
  const servers = readMcpServers();
  assert.equal(servers["remote"]?.url, "http://localhost:3001/sse");
  assert.equal(servers["remote"]?.command, undefined);
});

test("mcp add: rejects both --command and --url", async () => {
  setupTempHome();
  const exitCode = await runMcpAdd({ name: "bad", command: "node", url: "http://localhost" });
  assert.equal(exitCode, 2);
});

test("mcp add: rejects neither --command nor --url", async () => {
  setupTempHome();
  const exitCode = await runMcpAdd({ name: "bad" });
  assert.equal(exitCode, 2);
});

test("mcp remove: nonexistent server returns exit 1", async () => {
  setupTempHome();
  const exitCode = await runMcpRemove({ name: "nope" });
  assert.equal(exitCode, 1);
});

test("mcp list: empty returns 0", async () => {
  setupTempHome();
  const exitCode = await runMcpList();
  assert.equal(exitCode, 0);
});

test("mcp list: shows servers after add", async () => {
  setupTempHome();
  await runMcpAdd({ name: "srv-a", command: "echo", args: "hello" });
  await runMcpAdd({ name: "srv-b", url: "http://localhost:4321" });
  const exitCode = await runMcpList();
  assert.equal(exitCode, 0);
});

test("mcp test: nonexistent server returns exit 1", async () => {
  setupTempHome();
  const exitCode = await runMcpTest({ name: "nope" });
  assert.equal(exitCode, 1);
});

test("mcp config: preserves env vars on add", async () => {
  setupTempHome();
  await runMcpAdd({ name: "with-env", command: "python", env: "API_KEY=abc,DEBUG=true" });
  const servers = readMcpServers();
  assert.deepEqual(servers["with-env"]?.env, { API_KEY: "abc", DEBUG: "true" });
});

// ── Statusline CLI command round-trip ───────────────────────────────────────


test("statusline CLI: default shows all chips", async () => {
  setupTempHome();
  const exitCode = await runStatusline({});
  assert.equal(exitCode, 0);
  const chips = readStatuslineChips();
  assert.deepEqual(chips, DEFAULT_STATUSLINE_CHIPS);
});

test("statusline CLI: --set custom order", async () => {
  setupTempHome();
  const exitCode = await runStatusline({ set: "model,agent,state" });
  assert.equal(exitCode, 0);
  assert.deepEqual(readStatuslineChips(), ["model", "agent", "state"]);
});

test("statusline CLI: --set invalid chip returns exit 2", async () => {
  setupTempHome();
  const exitCode = await runStatusline({ set: "model,bogus" });
  assert.equal(exitCode, 2);
  // Config should not have changed
  assert.deepEqual(readStatuslineChips(), DEFAULT_STATUSLINE_CHIPS);
});

test("statusline CLI: --hide removes a chip", async () => {
  setupTempHome();
  const exitCode = await runStatusline({ hide: "tokens" });
  assert.equal(exitCode, 0);
  const chips = readStatuslineChips();
  assert.ok(!chips.includes("tokens"));
  assert.equal(chips.length, DEFAULT_STATUSLINE_CHIPS.length - 1);
});

test("statusline CLI: --hide invalid chip returns exit 2", async () => {
  setupTempHome();
  const exitCode = await runStatusline({ hide: "bogus" });
  assert.equal(exitCode, 2);
});

test("statusline CLI: --hide last chip returns exit 2", async () => {
  setupTempHome();
  writeStatuslineChips(["agent"]);
  const exitCode = await runStatusline({ hide: "agent" });
  assert.equal(exitCode, 2);
});

test("statusline CLI: --show adds a chip", async () => {
  setupTempHome();
  writeStatuslineChips(["agent", "model"] as StatuslineChip[]);
  const exitCode = await runStatusline({ show: "state" });
  assert.equal(exitCode, 0);
  const chips = readStatuslineChips();
  assert.deepEqual(chips, ["agent", "model", "state"]);
});

test("statusline CLI: --show existing chip is idempotent", async () => {
  setupTempHome();
  writeStatuslineChips(["agent", "model"] as StatuslineChip[]);
  const exitCode = await runStatusline({ show: "model" });
  assert.equal(exitCode, 0);
  const chips = readStatuslineChips();
  assert.deepEqual(chips, ["agent", "model"]);
});

test("statusline CLI: --reset restores defaults", async () => {
  setupTempHome();
  writeStatuslineChips(["model"] as StatuslineChip[]);
  const exitCode = await runStatusline({ reset: true });
  assert.equal(exitCode, 0);
  assert.deepEqual(readStatuslineChips(), DEFAULT_STATUSLINE_CHIPS);
});
});
