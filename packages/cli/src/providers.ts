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
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  openrouter: { label: "OpenRouter (aggregator)", envKeys: ["OPENROUTER_API_KEY"] },
  anthropic: { label: "Anthropic (Claude)", envKeys: ["ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN"] },
  openai: { label: "OpenAI", envKeys: ["OPENAI_API_KEY"] },
  "openai-codex": { label: "OpenAI Codex (subscription)", envKeys: [], oauth: true },
  google: { label: "Google (Gemini)", envKeys: ["GEMINI_API_KEY"] },
  "github-copilot": { label: "GitHub Copilot (subscription)", envKeys: [], oauth: true },
  deepseek: { label: "DeepSeek", envKeys: ["DEEPSEEK_API_KEY"] },
  "kimi-coding": { label: "Kimi Code", envKeys: ["KIMI_API_KEY"] },
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
