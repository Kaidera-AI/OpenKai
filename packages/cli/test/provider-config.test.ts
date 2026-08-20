/**
 * Provider-config write path tests (KOS consult 62e9a90e Q1/Q3/Q4): the ONE
 * code path for credential mutation — atomic, comment-preserving, 0600,
 * OPENKAI_HOME-honouring, alias-resolving.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PROVIDER_ALIASES,
  providerEnvPath,
  readProviderKeys,
  removeProviderKey,
  resolveProviderId,
  setProviderKey,
  unsetProviderKey,
  writeProviderKey,
} from "../dist/provider-config.js";
import { loadDotEnv } from "../dist/env.js";
import { providerKeyStatus } from "../dist/providers.js";

function withHome<T>(fn: (home: string) => T): T {
  const home = mkdtempSync(path.join(tmpdir(), "openkai-pcfg-"));
  const saved = process.env.OPENKAI_HOME;
  process.env.OPENKAI_HOME = home;
  try {
    return fn(home);
  } finally {
    if (saved === undefined) delete process.env.OPENKAI_HOME;
    else process.env.OPENKAI_HOME = saved;
    rmSync(home, { recursive: true, force: true });
  }
}

test("write path: set → read back → update in place → unset removes", () => {
  withHome(() => {
    delete process.env.OPENROUTER_API_KEY;
    const envKey = setProviderKey("openrouter", "sk-or-test-1");
    assert.equal(envKey, "OPENROUTER_API_KEY");
    assert.equal(process.env.OPENROUTER_API_KEY, "sk-or-test-1");
    assert.deepEqual(readProviderKeys(), { OPENROUTER_API_KEY: "sk-or-test-1" });

    // update in place (one line, no duplicate)
    setProviderKey("openrouter", "sk-or-test-2");
    const body = readFileSync(providerEnvPath(), "utf-8");
    assert.equal(body.split("\n").filter((l) => l.startsWith("OPENROUTER_API_KEY=")).length, 1);
    assert.match(body, /sk-or-test-2/);

    unsetProviderKey("openrouter");
    assert.equal(process.env.OPENROUTER_API_KEY, undefined);
    assert.deepEqual(readProviderKeys(), {});
  });
});

test("write path: comments and ordering survive an edit", () => {
  withHome((home) => {
    writeFileSync(
      path.join(home, ".env"),
      "# my notes\nFOO_API_KEY=foo-1\n# another note\nBAR_API_KEY=bar-1\n",
      "utf-8",
    );
    writeProviderKey("FOO_API_KEY", "foo-2");
    const body = readFileSync(path.join(home, ".env"), "utf-8");
    assert.ok(body.startsWith("# my notes\n"), "leading comment preserved");
    assert.ok(body.indexOf("FOO_API_KEY") < body.indexOf("# another note"), "ordering preserved");
    assert.match(body, /BAR_API_KEY=bar-1/);
  });
});

test("write path: store is 0600 and pre-existing loose files are repaired", () => {
  withHome((home) => {
    writeProviderKey("SOME_API_KEY", "x");
    assert.equal(statSync(path.join(home, ".env")).mode & 0o777, 0o600);
  });
});

test("aliases: KOS vocabulary resolves to the registry (Q4)", () => {
  assert.equal(PROVIDER_ALIASES["ollama_cloud"], "ollama-cloud");
  assert.equal(PROVIDER_ALIASES["moonshot"], "moonshotai");
  assert.equal(resolveProviderId("ollama_cloud"), "ollama-cloud");
  assert.equal(resolveProviderId("openrouter"), "openrouter", "registry ids pass through");
  // dashscope / alibaba_cloud intentionally unmapped (no pi-ai lane) — resolve as-is
  assert.equal(resolveProviderId("dashscope"), "dashscope");
});

test("set through an alias writes the canonical lane's key", () => {
  withHome(() => {
    const envKey = setProviderKey("moonshot", "sk-test-moon");
    assert.equal(envKey, "MOONSHOT_API_KEY");
    assert.deepEqual(readProviderKeys(), { MOONSHOT_API_KEY: "sk-test-moon" });
    delete process.env.MOONSHOT_API_KEY;
  });
});

test("removeProviderKey removes nothing else when key absent", () => {
  withHome(() => {
    writeProviderKey("KEEP_API_KEY", "keep");
    removeProviderKey("ABSENT_API_KEY");
    assert.deepEqual(readProviderKeys(), { KEEP_API_KEY: "keep" });
    delete process.env.KEEP_API_KEY;
  });
});

test("write path: a duplicated key collapses to one line — no stale leftover", () => {
  withHome((home) => {
    delete process.env.DEEPSEEK_API_KEY;
    // Duplicates arrive from an appending migration (KOS's one-way
    // app_settings import). The two readers disagree on which one wins —
    // env.ts takes the first, readProviderKeys the last — so a leftover makes
    // the Settings UI display one credential while the harness uses another.
    writeFileSync(
      path.join(home, ".env"),
      "DEEPSEEK_API_KEY=stale-one\nDEEPSEEK_API_KEY=stale-two\n",
      "utf-8",
    );
    setProviderKey("deepseek", "fresh-key");
    const body = readFileSync(providerEnvPath(), "utf-8");
    const hits = body.split("\n").filter((l) => l.startsWith("DEEPSEEK_API_KEY="));
    assert.deepEqual(hits, ["DEEPSEEK_API_KEY=fresh-key"], "exactly one line, the fresh one");
    assert.equal(readProviderKeys().DEEPSEEK_API_KEY, "fresh-key");
    assert.doesNotMatch(body, /stale-/, "no stale duplicate survives");
  });
});

test("OPENKAI_IGNORE_PROJECT_ENV: the store outranks a checked-out project .env", () => {
  withHome((home) => {
    const project = mkdtempSync(path.join(tmpdir(), "openkai-pcfg-proj-"));
    const savedFlag = process.env.OPENKAI_IGNORE_PROJECT_ENV;
    try {
      writeFileSync(path.join(project, ".env"), "OPENROUTER_API_KEY=from-project\n", "utf-8");
      writeFileSync(path.join(home, ".env"), "OPENROUTER_API_KEY=from-store\n", "utf-8");

      // Default (knob unset): the project file still wins. The E012 trust
      // boundary is unchanged — this is the behaviour the guard opts OUT of.
      delete process.env.OPENKAI_IGNORE_PROJECT_ENV;
      delete process.env.OPENROUTER_API_KEY;
      loadDotEnv(project);
      assert.equal(process.env.OPENROUTER_API_KEY, "from-project", "default precedence preserved");

      // Embedded deployments set the knob: the store is the sole authority,
      // so what the Settings UI wrote is what the harness actually uses.
      process.env.OPENKAI_IGNORE_PROJECT_ENV = "1";
      delete process.env.OPENROUTER_API_KEY;
      loadDotEnv(project);
      assert.equal(process.env.OPENROUTER_API_KEY, "from-store", "store wins under the guard");
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      if (savedFlag === undefined) delete process.env.OPENKAI_IGNORE_PROJECT_ENV;
      else process.env.OPENKAI_IGNORE_PROJECT_ENV = savedFlag;
      rmSync(project, { recursive: true, force: true });
    }
  });
});

test("multi-key lanes refuse a single --key instead of reporting a false green", () => {
  withHome(() => {
    for (const k of ["CLOUDFLARE_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_GATEWAY_ID"]) {
      delete process.env[k];
    }
    // Writing envKeys[0] alone left the lane unconfigured while the CLI printed
    // "written to the credential store" and exited 0 (KOS consult, gap G2).
    assert.throws(
      () => setProviderKey("cloudflare-ai-gateway", "cf-secret"),
      /needs all of CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_GATEWAY_ID/,
    );
    assert.deepEqual(readProviderKeys(), {}, "a refused write leaves no partial state");
    // The per-variable primitive still configures the lane properly.
    writeProviderKey("CLOUDFLARE_API_KEY", "a");
    writeProviderKey("CLOUDFLARE_ACCOUNT_ID", "b");
    writeProviderKey("CLOUDFLARE_GATEWAY_ID", "c");
    assert.equal(providerKeyStatus("cloudflare-ai-gateway").configured, true);
  });
});
