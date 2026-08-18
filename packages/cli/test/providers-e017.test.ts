/**
 * E017 completeness tests (providers slice):
 *
 *  1. Ollama provider shape — keyless local lane + OLLAMA_API_KEY cloud lane,
 *     dynamic model discovery via the NATIVE /api/tags shape (not OpenAI's
 *     /models envelope), all with a mocked fetch (fully offline).
 *  2. Provider-table completeness — every pi-ai bundled catalogue lane is
 *     either in PROVIDERS or in SKIPPED_PROVIDERS with a reason, and the
 *     table carries no stale/typo'd ids.
 *  3. Posture config write — writeShiftPosture honours the pinned
 *     config.json "shift" contract and preserves operator pins.
 *  4. Steer registry semantics — register-on-start, steerable while live,
 *     deleted on settle; the child's sessionId rides the result details.
 *
 * Runner: node:test against built output (see test:build).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import {
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_LOCAL_BASE_URL,
  activeChildren,
  defaultModels,
  ollamaCloudProvider,
  ollamaProvider,
  steerChild,
  taskTool,
} from "@kaidera/openkai-core";

import { PROVIDERS, SKIPPED_PROVIDERS, providerKeyStatus } from "../dist/providers.js";
import { readConfigFile, writeShiftPosture } from "../dist/config.js";

/** Swap globalThis.fetch for a mock around one test body; always restored. */
async function withMockFetch(
  mock: (url: string, init?: RequestInit) => Promise<Response>,
  body: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  // The mock covers only the (url, init) surface these tests exercise.
  globalThis.fetch = (async (input: unknown, init?: RequestInit) =>
    mock(String(input), init)) as typeof fetch;
  try {
    await body();
  } finally {
    globalThis.fetch = original;
  }
}

/** Swap one env var around a test body; always restored. */
async function withEnv(name: string, value: string | undefined, body: () => Promise<void>): Promise<void> {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await body();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

// ── 1. Ollama providers ─────────────────────────────────────────────────────

test("ollama provider shape: keyless local lane, openai-completions api", () => {
  const provider = ollamaProvider();
  assert.equal(provider.id, "ollama");
  assert.equal(provider.name, "Ollama (local)");
  assert.equal(provider.baseUrl, OLLAMA_LOCAL_BASE_URL);
  assert.equal(provider.auth.apiKey?.name, "Ollama local server");
  assert.equal(provider.auth.oauth, undefined);
  // Dynamic provider: empty before the first refresh, and refreshable.
  assert.deepEqual(provider.getModels(), []);
  assert.equal(typeof provider.refreshModels, "function");

  const cloud = ollamaCloudProvider();
  assert.equal(cloud.id, "ollama-cloud");
  assert.equal(cloud.baseUrl, OLLAMA_CLOUD_BASE_URL);
  assert.deepEqual(cloud.getModels(), []);
});

test("ollama lanes are registered in defaultModels()", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "ok-e017-home-"));
  await withEnv("OPENKAI_HOME", home, async () => {
    try {
      const models = defaultModels();
      assert.equal(models.getProvider("ollama")?.baseUrl, OLLAMA_LOCAL_BASE_URL);
      assert.equal(models.getProvider("ollama-cloud")?.baseUrl, OLLAMA_CLOUD_BASE_URL);
      // The built-ins survived the two additions.
      assert.ok(models.getProvider("openrouter") !== undefined);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

test("ollama local: auth reports configured iff the server answers; models map from /api/tags", async () => {
  await withMockFetch(
    async (url) => {
      if (url === "http://localhost:11434/api/version") return jsonResponse({ version: "0.9.0" });
      if (url === "http://localhost:11434/api/tags") {
        return jsonResponse({
          models: [
            { name: "llama3.2:latest", model: "llama3.2:latest", size: 123 },
            { name: "qwen3:8b" },
            { model: "no-name-entry-ignored" },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    },
    async () => {
      const models = createModels();
      models.setProvider(ollamaProvider());

      // Keyless-local semantics: reachable server ⇒ auth resolves.
      const auth = await models.getAuth("ollama");
      assert.ok(auth !== undefined, "reachable server must report configured");
      assert.equal(auth.source, "local server");

      const refresh = await models.refresh({ providers: ["ollama"], allowNetwork: true, force: true });
      assert.deepEqual([...refresh.errors.keys()], []);

      const listed = models.getModels("ollama");
      assert.deepEqual(listed.map((m) => m.id), ["llama3.2:latest", "qwen3:8b"]);
      const model = listed[0]!;
      assert.equal(model.api, "openai-completions");
      assert.equal(model.provider, "ollama");
      assert.equal(model.baseUrl, OLLAMA_LOCAL_BASE_URL);
      assert.equal(model.reasoning, false);
      assert.deepEqual(model.input, ["text"]);
      // /api/tags reports no context length: the served default (4096) is claimed.
      assert.equal(model.contextWindow, 4096);
    },
  );
});

test("ollama local: unreachable server ⇒ auth unconfigured, refresh skips, no models", async () => {
  await withMockFetch(
    async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    },
    async () => {
      const models = createModels();
      models.setProvider(ollamaProvider());
      assert.equal(await models.getAuth("ollama"), undefined);
      const refresh = await models.refresh({ providers: ["ollama"], allowNetwork: true, force: true });
      // Unconfigured providers are skipped, not errored.
      assert.deepEqual([...refresh.errors.keys()], []);
      assert.deepEqual(models.getModels("ollama"), []);
    },
  );
});

test("ollama local: /api/tags failure retains the list and surfaces a refresh error", async () => {
  await withMockFetch(
    async (url) => {
      if (url.endsWith("/api/version")) return jsonResponse({ version: "0.9.0" });
      if (url.endsWith("/api/tags")) return new Response("boom", { status: 500 });
      return new Response("not found", { status: 404 });
    },
    async () => {
      const models = createModels();
      models.setProvider(ollamaProvider());
      const refresh = await models.refresh({ providers: ["ollama"], allowNetwork: true, force: true });
      assert.ok(refresh.errors.get("ollama") instanceof Error);
      assert.match(refresh.errors.get("ollama")!.message, /HTTP 500/);
      assert.deepEqual(models.getModels("ollama"), []);
    },
  );
});

test("ollama-cloud: OLLAMA_API_KEY bearer flows to /api/tags; models list maps identically", async () => {
  const seen: { url: string; authorization?: string }[] = [];
  await withEnv("OLLAMA_API_KEY", "test-ollama-cloud-key", async () => {
    await withMockFetch(
      async (url, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        seen.push({ url, authorization: headers["authorization"] });
        if (url === "https://ollama.com/api/tags") return jsonResponse({ models: [{ name: "gpt-oss:120b-cloud" }] });
        return new Response("not found", { status: 404 });
      },
      async () => {
        const models = createModels();
        models.setProvider(ollamaCloudProvider());
        const auth = await models.getAuth("ollama-cloud");
        assert.ok(auth !== undefined, "env key must configure the cloud lane");
        assert.equal(auth.auth.apiKey, "test-ollama-cloud-key");

        const refresh = await models.refresh({ providers: ["ollama-cloud"], allowNetwork: true, force: true });
        assert.deepEqual([...refresh.errors.keys()], []);
        const listed = models.getModels("ollama-cloud");
        assert.deepEqual(listed.map((m) => m.id), ["gpt-oss:120b-cloud"]);
        assert.equal(listed[0]!.provider, "ollama-cloud");
        assert.equal(listed[0]!.baseUrl, OLLAMA_CLOUD_BASE_URL);
      },
    );
  });
  const tagsCall = seen.find((entry) => entry.url === "https://ollama.com/api/tags");
  assert.equal(tagsCall?.authorization, "Bearer test-ollama-cloud-key");
});

// ── 2. Provider-table completeness ─────────────────────────────────────────

function piAiCatalogueIds(): string[] {
  // import.meta.resolve: pi-ai's exports map carries only the `import`
  // condition, so require.resolve cannot see the package entry.
  const entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-ai")); // …/dist/index.js
  const dataDir = path.join(path.dirname(entry), "providers", "data");
  return readdirSync(dataDir)
    .filter((file) => file.endsWith(".json") && !file.startsWith(".")) // .manifest.json is not a lane
    .map((file) => file.replace(/\.json$/, ""));
}

test("every pi-ai catalogue lane is in PROVIDERS or deliberately SKIPPED", () => {
  const catalogue = piAiCatalogueIds();
  assert.ok(catalogue.length > 30, `expected the pi-ai catalogue, got ${catalogue.length} entries`);
  for (const id of catalogue) {
    assert.ok(
      PROVIDERS[id] !== undefined || SKIPPED_PROVIDERS[id] !== undefined,
      `catalogue lane "${id}" is neither in PROVIDERS nor in SKIPPED_PROVIDERS`,
    );
  }
  // The skips stay honest: no stale entries, and the named ambient-auth lanes.
  for (const id of Object.keys(SKIPPED_PROVIDERS)) {
    assert.ok(catalogue.includes(id), `SKIPPED_PROVIDERS entry "${id}" is not in the catalogue`);
    assert.equal(PROVIDERS[id], undefined, `"${id}" cannot be both provided and skipped`);
  }
  assert.deepEqual(Object.keys(SKIPPED_PROVIDERS).sort(), ["amazon-bedrock", "azure-openai-responses"]);
  // And the table names no lane that does not exist (ollama lanes are ours).
  for (const id of Object.keys(PROVIDERS)) {
    assert.ok(
      catalogue.includes(id) || id === "ollama" || id === "ollama-cloud",
      `PROVIDERS entry "${id}" matches no pi-ai catalogue lane`,
    );
  }
});

test("keyless + requiresAllKeys status semantics", async () => {
  // Keyless lane: configured with nothing set, never claims an env var.
  const ollama = providerKeyStatus("ollama");
  assert.equal(ollama.configured, true);
  assert.equal(ollama.via, undefined);
  assert.equal(ollama.needsKey, undefined);

  await withEnv("CLOUDFLARE_API_KEY", "cf-key", async () => {
    await withEnv("CLOUDFLARE_ACCOUNT_ID", undefined, async () => {
      const partial = providerKeyStatus("cloudflare-ai-gateway");
      assert.equal(partial.configured, false);
      assert.equal(partial.needsKey, "CLOUDFLARE_ACCOUNT_ID");
    });
    await withEnv("CLOUDFLARE_ACCOUNT_ID", "acct", async () => {
      await withEnv("CLOUDFLARE_GATEWAY_ID", "gw", async () => {
        const full = providerKeyStatus("cloudflare-ai-gateway");
        assert.equal(full.configured, true);
        assert.equal(full.via, "CLOUDFLARE_API_KEY");
      });
    });
  });
});

// ── 3. Posture config write ────────────────────────────────────────────────

test("writeShiftPosture writes the pinned shift contract and preserves pins", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "ok-e017-shift-"));
  await withEnv("OPENKAI_HOME", home, async () => {
    try {
      // Operator hand-edited config with pins + an unrelated key.
      await writeFile(
        path.join(home, "config.json"),
        JSON.stringify({
          theme: "pi",
          shift: { pins: { floor: { build: "capable" }, ceiling: "capable", never: ["openai/gpt-5"] } },
        }) + "\n",
        "utf-8",
      );
      writeShiftPosture("saver");
      const config = readConfigFile();
      assert.equal(config["theme"], "pi");
      assert.deepEqual(config["shift"], {
        posture: "saver",
        pins: { floor: { build: "capable" }, ceiling: "capable", never: ["openai/gpt-5"] },
      });

      // A malformed shift slice is replaced, not merged into.
      await writeFile(path.join(home, "config.json"), JSON.stringify({ shift: "junk" }) + "\n", "utf-8");
      writeShiftPosture("quality");
      assert.deepEqual(readConfigFile()["shift"], { posture: "quality" });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

// ── 4. Steer registry semantics ─────────────────────────────────────────────

test("steer registry: register-on-start, steerable while live, deleted on settle", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "ok-e017-steer-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "ok-e017-cwd-"));
  await withEnv("OPENKAI_HOME", home, async () => {
    await withEnv("OPENROUTER_API_KEY", "test-key-e017", async () => {
      try {
        assert.deepEqual(activeChildren(), []);
        assert.equal(steerChild("task-never-existed", "hello"), false);

        const tool = taskTool(cwd, "ai21/jamba-large-1.7");
        const controller = new AbortController();
        const run = tool.execute("tc-e017", { prompt: "reply with ok", timeoutSeconds: 30 }, controller.signal);

        // Registration is synchronous: visible before execute() first yields.
        const ids = activeChildren();
        assert.equal(ids.length, 1);
        const sessionId = ids[0]!;
        assert.ok(sessionId.startsWith("task-"));
        assert.equal(steerChild(sessionId, "steer note from the parent"), true);
        assert.equal(steerChild("task-someone-else", "nope"), false);

        controller.abort();
        const result = await run;
        const details = result.details as Record<string, unknown>;
        // The child is named in the result details so the parent can steer it.
        assert.equal(details["sessionId"], sessionId);

        // Settled children leave the registry and refuse steering.
        assert.deepEqual(activeChildren(), []);
        assert.equal(steerChild(sessionId, "too late"), false);
      } finally {
        await rm(home, { recursive: true, force: true });
        await rm(cwd, { recursive: true, force: true });
      }
    });
  });
});
