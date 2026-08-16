/**
 * Casts — curated model sets for fusion runs (E002 Inc 01). Fusion-first
 * means the operator never assembles a panel by hand: a cast names the
 * architect + builder (+ judge) per tier, per provider.
 *
 * The table is DATA, editable via `~/.openkai/config.json` ("casts" key);
 * every cast entry must resolve against the provider's bundled catalogue at
 * use time — an unresolvable cast is skipped with a named error, never a
 * silent fallback.
 */


export type CastTier = "cheap" | "balanced" | "frontier";

export interface Cast {
  id: string;
  tier: CastTier;
  provider: string;
  architectModel: string;
  builderModel: string;
  judgeModel?: string;
  label: string;
}

/** The config slice casts read (supplied by the caller — no file I/O here). */
export interface CastConfig {
  casts?: Cast[];
  defaultCast?: string;
}

/**
 * The built-in casts. Self-pairing tiers (same model twice) exist because
 * role separation alone delivers most of the lift (E016); split-model tiers
 * are the fusion-first default.
 */
export const BUILTIN_CASTS: readonly Cast[] = [
  {
    id: "balanced",
    tier: "balanced",
    provider: "nvidia",
    architectModel: "meta/llama-3.1-70b-instruct",
    builderModel: "meta/llama-3.1-8b-instruct",
    label: "Balanced — 70b plans, 8b builds (nvidia)",
  },
  {
    id: "cheap",
    tier: "cheap",
    provider: "nvidia",
    architectModel: "meta/llama-3.1-8b-instruct",
    builderModel: "meta/llama-3.1-8b-instruct",
    label: "Cheap — self-paired 8b (nvidia)",
  },
  {
    id: "openrouter-free",
    tier: "cheap",
    provider: "openrouter",
    architectModel: "nvidia/nemotron-3-nano-30b-a3b:free",
    builderModel: "nvidia/nemotron-3-nano-30b-a3b:free",
    label: "Free tier — self-paired nemotron (openrouter)",
  },
];

/** All casts: operator-configured casts override built-ins by id. */
export function listCasts(config: CastConfig = {}): Cast[] {
  const custom = Array.isArray(config.casts) ? config.casts : [];
  const byId = new Map<string, Cast>();
  for (const cast of BUILTIN_CASTS) byId.set(cast.id, cast);
  for (const cast of custom) byId.set(cast.id, cast);
  return [...byId.values()];
}

/** Resolve one cast by id (or the default: config, then `balanced`, else first). */
export function resolveCast(id?: string, config: CastConfig = {}): Cast | undefined {
  const casts = listCasts(config);
  if (id) return casts.find((c) => c.id === id);
  if (config.defaultCast) {
    const hit = casts.find((c) => c.id === config.defaultCast);
    if (hit) return hit;
  }
  return casts.find((c) => c.id === "balanced") ?? casts[0];
}
