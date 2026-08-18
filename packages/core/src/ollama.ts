/**
 * Ollama providers (E017, CTO request) — two lanes over the pi-ai `Provider`
 * contract, OpenKai-owned because pi-ai's bundled catalogue has no Ollama
 * entry:
 *
 * - `ollama`: a KEYLESS local server (default `http://localhost:11434/v1`).
 *   Auth follows the keyless-local semantics the pi-ai `ProviderAuth`
 *   interface prescribes ("keyless local servers provide `apiKey` auth whose
 *   `resolve()` reports whether the provider is configured"): resolve probes
 *   the server and reports configured only when it answers, returning the
 *   placeholder bearer the OpenAI-compat client requires (pi-ai's
 *   openai-completions api refuses a request with no key at all; the Ollama
 *   endpoint ignores the header). Probes are cached briefly so per-request
 *   auth resolution does not hammer localhost.
 * - `ollama-cloud`: `https://ollama.com/v1` behind an `OLLAMA_API_KEY`
 *   bearer (standard env-key auth).
 *
 * Both list models dynamically via `GET {origin}/api/tags` — Ollama's native
 * shape `{ models: [{ name, ... }] }`, NOT the OpenAI `/models` shape
 * `{ data: [{ id }] }`; the mapping below is explicit. Streaming is
 * OpenAI-compatible chat completions via pi-ai's openai-completions api.
 *
 * `/api/tags` reports no context length, so discovered models carry Ollama's
 * served default context (4096 — the honest floor: claiming the model's
 * trained window would let the harness defer compaction past what the server
 * actually attends to). Operators raise it via `num_ctx` /
 * OLLAMA_CONTEXT_LENGTH and the next refresh re-reads the server.
 */

import { createProvider, envApiKeyAuth } from "@earendil-works/pi-ai";
import type {
  ApiKeyAuth,
  AuthResult,
  Model,
  Provider,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

/** Default base URL of a local Ollama server's OpenAI-compatible endpoint. */
export const OLLAMA_LOCAL_BASE_URL = "http://localhost:11434/v1";
/** Ollama Cloud's OpenAI-compatible endpoint (OLLAMA_API_KEY bearer). */
export const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/v1";

/**
 * Placeholder bearer for the keyless lane: pi-ai's OpenAI-compat client
 * throws when neither an apiKey nor an Authorization header exists, and the
 * Ollama endpoint ignores the value.
 */
const OLLAMA_PLACEHOLDER_KEY = "ollama";

/** Ollama's served default context (`num_ctx` unless the operator raised it). */
const OLLAMA_SERVED_CONTEXT_WINDOW = 4096;

/** Reachability probe bounds: short enough to fail fast, cached to amortise. */
const PROBE_TIMEOUT_MS = 2_000;
const PROBE_CACHE_MS = 10_000;

/** GET {origin}/api/version — Ollama's liveness endpoint at the server root. */
async function serverReachable(baseUrl: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(new URL("/api/version", baseUrl), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)]),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Keyless-local api-key auth: configured iff the server answers a probe.
 * No `login` — there is nothing to enter. No `check` — the probe IS the
 * check (pi-ai falls back to `resolve()` when `check` is absent, which is
 * the same network call).
 */
function ollamaLocalAuth(baseUrl: string): ApiKeyAuth {
  let probedAt = 0;
  let cached: AuthResult | undefined;
  return {
    name: "Ollama local server",
    resolve: async ({ signal }) => {
      const now = Date.now();
      if (now - probedAt < PROBE_CACHE_MS) return cached;
      const up = await serverReachable(baseUrl, signal);
      if (signal.aborted) return undefined; // caller gone — do not cache a raced probe
      probedAt = now;
      cached = up
        ? { auth: { apiKey: OLLAMA_PLACEHOLDER_KEY }, source: "local server" }
        : undefined;
      return cached;
    },
  };
}

/** The `/api/tags` shape (native Ollama, not the OpenAI `/models` envelope). */
interface OllamaTagsResponse {
  models?: { name?: unknown }[];
}

/**
 * Fetch the server's model list and map it onto pi-ai `Model`s. `/api/tags`
 * hangs off the server ROOT (not the `/v1` API prefix), so the URL is built
 * from the base URL's origin. The cloud lane's bearer travels with the
 * resolved credential; the keyless lane's placeholder is never sent.
 */
async function fetchOllamaTags(
  providerId: string,
  baseUrl: string,
  context: RefreshModelsContext,
): Promise<Model<"openai-completions">[]> {
  const headers: Record<string, string> = {};
  const credential = context.credential;
  if (
    credential?.type === "api_key" &&
    typeof credential.key === "string" &&
    credential.key !== OLLAMA_PLACEHOLDER_KEY
  ) {
    headers["authorization"] = `Bearer ${credential.key}`;
  }
  const res = await fetch(new URL("/api/tags", baseUrl), {
    headers,
    signal: context.signal,
  });
  if (!res.ok) {
    throw new Error(`${providerId}: /api/tags answered HTTP ${res.status}`);
  }
  const body = (await res.json()) as OllamaTagsResponse;
  const entries = Array.isArray(body.models) ? body.models : [];
  const models: Model<"openai-completions">[] = [];
  for (const entry of entries) {
    const name = entry?.name;
    if (typeof name !== "string" || name.length === 0) continue;
    models.push({
      id: name,
      name,
      api: "openai-completions",
      provider: providerId,
      baseUrl,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: OLLAMA_SERVED_CONTEXT_WINDOW,
      maxTokens: OLLAMA_SERVED_CONTEXT_WINDOW,
    });
  }
  return models;
}

/**
 * The keyless local lane. `getModels()` is empty until the first
 * `refreshModels()`; auth resolve reports configured iff the server answers.
 */
export function ollamaProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "ollama",
    name: "Ollama (local)",
    baseUrl: OLLAMA_LOCAL_BASE_URL,
    auth: { apiKey: ollamaLocalAuth(OLLAMA_LOCAL_BASE_URL) },
    models: [],
    fetchModels: (context) => fetchOllamaTags("ollama", OLLAMA_LOCAL_BASE_URL, context),
    api: openAICompletionsApi(),
  });
}

/** The cloud lane: same discovery mechanism, env-key bearer auth. */
export function ollamaCloudProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "ollama-cloud",
    name: "Ollama Cloud",
    baseUrl: OLLAMA_CLOUD_BASE_URL,
    auth: { apiKey: envApiKeyAuth("Ollama Cloud API key", ["OLLAMA_API_KEY"]) },
    models: [],
    fetchModels: (context) => fetchOllamaTags("ollama-cloud", OLLAMA_CLOUD_BASE_URL, context),
    api: openAICompletionsApi(),
  });
}
