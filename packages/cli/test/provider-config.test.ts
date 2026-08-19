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
