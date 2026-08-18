/**
 * Provider registry — how OpenKai connects to model providers (pi-ai substrate).
 *
 * The env-var names are pi-ai's conventions (its internal env-api-keys module
 * is not on the package exports map, so the table lives here — the names are
 * stable industry conventions). OAuth subscription lanes carry no raw key.
 */

import { listCasts } from "@kaidera/openkai-core";

export interface ProviderInfo {
  /** Display label. */
  label: string;
  /** Env vars that configure this provider, first = canonical. */
  envKeys: string[];
  /** True when auth is an OAuth subscription flow, not a raw key. */
  oauth?: boolean;
  /**
   * True when the lane needs no credential at all (keyless local server).
   * Status reports configured — there is nothing to configure; whether the
   * server answers is a runtime probe, not an env check.
   */
  keyless?: boolean;
  /**
   * True when EVERY env key must be set (default: any one suffices — the
   * entries are alternative names for one secret). Cloudflare lanes need the
   * key AND the account/gateway id together.
   */
  requiresAllKeys?: boolean;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  openrouter: { label: "OpenRouter (aggregator)", envKeys: ["OPENROUTER_API_KEY"] },
  anthropic: { label: "Anthropic (Claude)", envKeys: ["ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN"], oauth: true },
  openai: { label: "OpenAI", envKeys: ["OPENAI_API_KEY"] },
  "openai-codex": { label: "OpenAI Codex (subscription)", envKeys: [], oauth: true },
  google: { label: "Google (Gemini)", envKeys: ["GEMINI_API_KEY"] },
  "github-copilot": { label: "GitHub Copilot (subscription)", envKeys: [], oauth: true },
  deepseek: { label: "DeepSeek", envKeys: ["DEEPSEEK_API_KEY"] },
  "kimi-coding": { label: "Kimi Code", envKeys: ["KIMI_API_KEY"], oauth: true },
  moonshotai: { label: "Moonshot AI", envKeys: ["MOONSHOT_API_KEY"] },
  "qwen-token-plan": { label: "Alibaba Qwen (subscription)", envKeys: ["QWEN_TOKEN_PLAN_API_KEY"] },
  xai: { label: "xAI (Grok)", envKeys: ["XAI_API_KEY"] },
  mistral: { label: "Mistral", envKeys: ["MISTRAL_API_KEY"] },
  groq: { label: "Groq", envKeys: ["GROQ_API_KEY"] },
  cerebras: { label: "Cerebras", envKeys: ["CEREBRAS_API_KEY"] },
  together: { label: "Together", envKeys: ["TOGETHER_API_KEY"] },
  fireworks: { label: "Fireworks", envKeys: ["FIREWORKS_API_KEY"] },
  nvidia: { label: "NVIDIA", envKeys: ["NVIDIA_API_KEY"] },
  minimax: { label: "MiniMax", envKeys: ["MINIMAX_API_KEY"] },
  zai: { label: "Z.ai", envKeys: ["ZAI_API_KEY"] },
  "vercel-ai-gateway": { label: "Vercel AI Gateway", envKeys: ["AI_GATEWAY_API_KEY"] },
  // ── E017: Ollama lanes (OpenKai-owned providers, core/ollama.ts) ──
  ollama: { label: "Ollama (local)", envKeys: [], keyless: true },
  "ollama-cloud": { label: "Ollama Cloud", envKeys: ["OLLAMA_API_KEY"] },
  // ── E017 catalogue diff: the remaining plain env-key lanes from pi-ai's
  // bundled catalogue. amazon-bedrock/azure stay out — see SKIPPED_PROVIDERS.
  huggingface: { label: "Hugging Face", envKeys: ["HF_TOKEN"] },
  baseten: { label: "Baseten", envKeys: ["BASETEN_API_KEY"] },
  "google-vertex": { label: "Google Vertex AI", envKeys: ["GOOGLE_CLOUD_API_KEY"] },
  "cloudflare-ai-gateway": { label: "Cloudflare AI Gateway", envKeys: ["CLOUDFLARE_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_GATEWAY_ID"], requiresAllKeys: true },
  "cloudflare-workers-ai": { label: "Cloudflare Workers AI", envKeys: ["CLOUDFLARE_API_KEY", "CLOUDFLARE_ACCOUNT_ID"], requiresAllKeys: true },
  opencode: { label: "OpenCode Zen", envKeys: ["OPENCODE_API_KEY"] },
  "opencode-go": { label: "OpenCode Go", envKeys: ["OPENCODE_API_KEY"] },
  "ant-ling": { label: "Ant Ling", envKeys: ["ANT_LING_API_KEY"] },
  "minimax-cn": { label: "MiniMax CN", envKeys: ["MINIMAX_CN_API_KEY"] },
  "moonshotai-cn": { label: "Moonshot AI CN", envKeys: ["MOONSHOT_API_KEY"] },
  "zai-coding-cn": { label: "Z.AI Coding CN", envKeys: ["ZAI_CODING_CN_API_KEY"] },
  "qwen-token-plan-cn": { label: "Alibaba Qwen Token Plan CN", envKeys: ["QWEN_TOKEN_PLAN_CN_API_KEY"] },
  "qwen-token-plan-individual": { label: "Alibaba Qwen Token Plan (individual)", envKeys: ["QWEN_TOKEN_PLAN_API_KEY"] },
  xiaomi: { label: "Xiaomi MiMo", envKeys: ["XIAOMI_API_KEY"] },
  "xiaomi-token-plan-cn": { label: "Xiaomi Token Plan CN", envKeys: ["XIAOMI_TOKEN_PLAN_CN_API_KEY"] },
  "xiaomi-token-plan-ams": { label: "Xiaomi Token Plan AMS", envKeys: ["XIAOMI_TOKEN_PLAN_AMS_API_KEY"] },
  "xiaomi-token-plan-sgp": { label: "Xiaomi Token Plan SGP", envKeys: ["XIAOMI_TOKEN_PLAN_SGP_API_KEY"] },
};

/**
 * pi-ai catalogue lanes deliberately NOT in the table (E017 diff): auth is
 * ambient (the AWS credential chain) or needs per-resource configuration a
 * plain env key cannot express. Recorded here so the catalogue diff test can
 * assert the skip is a decision, not an omission.
 */
export const SKIPPED_PROVIDERS: Record<string, string> = {
  "amazon-bedrock": "ambient AWS auth (profile / IAM keys / bearer / IRSA chain) — no single env key",
  "azure-openai-responses": "per-resource base URL required; an env key alone cannot route",
};

export const DEFAULT_PROVIDER = "openrouter";

export interface ProviderKeyStatus {
  provider: string;
  configured: boolean;
  /** The env var that satisfied the check, when configured. */
  via?: string;
  /** Canonical env var to set when unconfigured (undefined for OAuth lanes). */
  needsKey?: string;
  oauth?: boolean;
}

/** Resolve the active provider id: flag > env > default. */
export function resolveProvider(flag?: string): string {
  return flag ?? process.env.OPENKAI_PROVIDER ?? DEFAULT_PROVIDER;
}

/** Key/auth status for one provider against the live environment. */
export function providerKeyStatus(provider: string): ProviderKeyStatus {
  const info = PROVIDERS[provider];
  if (!info) {
    // Unknown to our table — pi-ai may still support it; require the
    // conventional <PROVIDER>_API_KEY and say so.
    const conventional = `${provider.replace(/-/g, "_").toUpperCase()}_API_KEY`;
    return {
      provider,
      configured: process.env[conventional] !== undefined,
      needsKey: conventional,
    };
  }
  // Keyless lanes (local Ollama): nothing to configure — readiness is a
  // runtime probe in core/ollama.ts, not an env check. `via` stays undefined
  // so runtime.ts's env-key fallback sweep never auto-selects the lane on a
  // fresh box (the keyless-boot sign-in overlay keeps its job).
  if (info.keyless === true) {
    return { provider, configured: true, oauth: info.oauth };
  }
  if (info.requiresAllKeys === true && info.envKeys.length > 1) {
    const missing = info.envKeys.filter((key) => process.env[key] === undefined);
    if (missing.length === 0) {
      return { provider, configured: true, via: info.envKeys[0], oauth: info.oauth };
    }
    return { provider, configured: false, needsKey: missing[0], oauth: info.oauth };
  }
  for (const key of info.envKeys) {
    if (process.env[key] !== undefined) {
      return { provider, configured: true, via: key, oauth: info.oauth };
    }
  }
  return {
    provider,
    configured: info.oauth === true, // OAuth lanes resolve tokens via their own flow
    needsKey: info.envKeys[0],
    oauth: info.oauth,
  };
}

/** Every configured provider id (env key present or OAuth lane). */
export function configuredProviders(): string[] {
  return Object.keys(PROVIDERS).filter((id) => providerKeyStatus(id).configured);
}

/**
 * Suggest a fusion partner for a just-picked model (E002). The suggestion
 * comes from the CAST data (the routing layer's curated role sets), never a
 * hardcoded string: the best cast on a DIFFERENT provider lane wins, so the
 * pairing is two independent providers by construction. One-lane setups get
 * the honest aggregator nudge.
 */
export function suggestFusionPartner(provider: string, modelId: string): string {
  const others = configuredProviders().filter((p) => p !== provider);
  if (others.length === 0) {
    return (
      `fusion note: one provider (${provider}) — self-pairing works, but a second lane ` +
      `(OpenRouter as an aggregator covers 300+ models; Fireworks/NVIDIA work too) ` +
      `lets two INDEPENDENT models fuse. Add one in ~/.openkai/.env`
    );
  }
  // The routing layer's curated casts decide the pairing: prefer a cast on
  // another lane; balanced tier first, then anything.
  const casts = listCasts().filter((c) => others.includes(c.provider));
  const cast =
    casts.find((c) => c.tier === "balanced") ?? casts[0];
  if (cast) {
    const partner =
      cast.provider === provider && cast.builderModel === modelId
        ? cast.architectModel
        : cast.builderModel;
    return (
      `fusion suggestion (${cast.id} cast): pair ${modelId} with ${partner} ` +
      `(${cast.provider}) — /fuse runs the architect/builder split across both`
    );
  }
  return `fusion suggestion: a second lane (${others[0]}) is configured — /fuse it`;
}
