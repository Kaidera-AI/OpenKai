/**
 * FU-2 — the synthesis step with provenance.
 *
 * A third completion (judge model, FRESH session) reads both role outputs
 * and emits the structured merge. OK-9 W4 upgrades it to the
 * literature-settled shape (research/2026-08-18-switchyard-routing-fusion-deep-dive.md
 * §4):
 *
 *  1. COMPARE-THEN-COMPOSE: the synthesiser first produces a pairwise
 *     comparison of the two outputs (LLM-Blender, arXiv:2306.02561 —
 *     pairwise ranking beats pointwise scoring), then composes consensus /
 *     divergence (kept, attributed) / discarded (with reason) / blind spots.
 *  2. STRONGEST SYNTHESISER, NEVER A PANEL MEMBER: {@link resolveSynthesiser}
 *     prefers the cast's judge over the architect and never the builder — a
 *     weak aggregator caps the whole system (MoA, arXiv:2406.04692), and a
 *     panel member grading its own lane invites self-preference bias, which
 *     scales with self-recognition (arXiv:2404.13076, arXiv:2305.19118).
 *  3. PARSE FAILURE KEEPS THE PANEL: unparseable output returns both role
 *     outputs verbatim with `synthesisError` set instead of throwing.
 *
 * Attribution tags remain mandatory: any divergence or discard that fails to
 * attribute its positions throws {@link AttributionError} — an unattributed
 * merge is a regression to a single opinion (E016 §3.2), and it fails loudly
 * here, not in review.
 */

import type { Api, Model, StreamFunction } from "@oh-my-pi/pi-ai";
import { complete } from "./complete.js";
import {
  AttributionError,
  type RoleOutput,
  type SynthesisArtifact,
  type SynthesisComparison,
  type SynthesisSideComparison,
} from "./types.js";

const SYNTHESIS_SYSTEM =
  "You are the SYNTHESISER in a fusion run: a fresh, third session with no " +
  "stake in either role. Merge the ARCHITECT and BUILDER outputs for the task " +
  "into one structured artefact, in two steps. STEP 1 — COMPARE the two " +
  "outputs pairwise before composing anything: for each side list its " +
  '"strengths" and its "blindSpots" (what THAT side missed), and list the ' +
  '"conflicts" — the points where the two outputs genuinely disagree. ' +
  "STEP 2 — COMPOSE, informed by that comparison: consensus lists only what " +
  "both support; every divergence keeps both positions WITH attribution; " +
  "every discard names a reason and whose position it was; blind spots are " +
  "what BOTH missed. " +
  "Output ONLY a JSON object with exactly these keys: " +
  '{"comparison": {"architect": {"strengths": string[], "blindSpots": string[]}, ' +
  '"builder": {"strengths": string[], "blindSpots": string[]}, ' +
  '"conflicts": string[]}, ' +
  '"consensus": string[], "divergences": [{"topic": string, "architect": string, ' +
  '"builder": string, "kept": "architect"|"builder"|"both"}], "discarded": ' +
  '[{"item": string, "reason": string, "by": "architect"|"builder"}], ' +
  '"blindSpots": string[]}. No prose, no markdown fence.';

/**
 * Pick the synthesiser model: the strongest available — the cast's judge,
 * else the architect; NEVER the builder or any panel member when a distinct
 * judge exists. Evidence (research/2026-08-18-switchyard-routing-fusion-deep-dive.md
 * §4): a weak aggregator caps the whole system regardless of panel strength
 * (MoA, arXiv:2406.04692 — best proposer ≠ best aggregator), and
 * self-preference bias scales with self-recognition (arXiv:2404.13076,
 * arXiv:2305.19118), so neither role may synthesise its own lane. The
 * synthesiser additionally always runs as a FRESH session (see
 * {@link runSynthesis}), so a distinct judge shares no context with either
 * panel member.
 */
export function resolveSynthesiser<T>(models: {
  judgeModel?: T;
  architectModel: T;
  /** Accepted but deliberately never returned: the builder never synthesises. */
  builderModel?: T;
}): T {
  return models.judgeModel ?? models.architectModel;
}

/** Extract the first balanced JSON object from model output. */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  if (start === -1) throw new Error("synthesis output contained no JSON object");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
    } else if (ch === "\\" && inString) {
      escaped = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) return candidate.slice(start, i + 1);
      }
    }
  }
  throw new Error("synthesis output JSON object was unbalanced");
}

interface RawSynthesis {
  comparison?: unknown;
  consensus?: unknown;
  divergences?: unknown;
  discarded?: unknown;
  blindSpots?: unknown;
}

/**
 * Narrow the pairwise comparison. Lenient (undefined on a malformed shape,
 * never a throw): the comparison informs the merge but carries no
 * attribution authority, so a model that skips the compare step degrades the
 * artifact rather than failing the run.
 */
function narrowComparison(value: unknown): SynthesisComparison | undefined {
  if (!value || typeof value !== "object") return undefined;
  const c = value as Record<string, unknown>;
  const side = (v: unknown): SynthesisSideComparison | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const s = v as Record<string, unknown>;
    if (!isStringArray(s["strengths"]) || !isStringArray(s["blindSpots"])) {
      return undefined;
    }
    return { strengths: s["strengths"], blindSpots: s["blindSpots"] };
  };
  const architect = side(c["architect"]);
  const builder = side(c["builder"]);
  if (!architect || !builder || !isStringArray(c["conflicts"])) return undefined;
  return { architect, builder, conflicts: c["conflicts"] };
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isDivergence = (value: unknown): value is SynthesisArtifact["divergences"][number] => {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d["topic"] === "string" &&
    typeof d["architect"] === "string" &&
    d["architect"].length > 0 &&
    typeof d["builder"] === "string" &&
    d["builder"].length > 0 &&
    (d["kept"] === "architect" || d["kept"] === "builder" || d["kept"] === "both")
  );
};

const isDiscard = (value: unknown): value is SynthesisArtifact["discarded"][number] => {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d["item"] === "string" &&
    typeof d["reason"] === "string" &&
    (d["by"] === "architect" || d["by"] === "builder")
  );
};

/**
 * Narrow the parsed merge, enforcing mandatory attribution: a divergence
 * with an empty position or a discard without an owner is unattributed and
 * throws {@link AttributionError}.
 */
function narrowItems<T>(
  items: unknown,
  guard: (value: unknown) => value is T,
  what: string,
): T[] {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => {
    if (!guard(item)) {
      throw new AttributionError(
        `unattributed ${what} in synthesis: ${JSON.stringify(item).slice(0, 160)}`,
      );
    }
    return item;
  });
}

/**
 * Run the synthesis. The synthesiser sees the task plus both role outputs —
 * labelled — and nothing else: it has no access to either role's session.
 */
export async function runSynthesis(
  streamFn: StreamFunction<Api>,
  model: Model<Api>,
  task: string,
  outputs: RoleOutput[],
): Promise<SynthesisArtifact> {
  const architect = outputs.find((o) => o.role === "architect");
  const builder = outputs.find((o) => o.role === "builder");
  if (!architect || !builder) {
    throw new Error("synthesis requires exactly one architect and one builder output");
  }

  const prompt =
    `TASK:\n${task}\n\n` +
    `[ARCHITECT OUTPUT]\n${architect.text}\n\n` +
    `[BUILDER OUTPUT]\n${builder.text}`;

  const result = await complete(streamFn, model, {
    system: SYNTHESIS_SYSTEM,
    prompt,
  });

  let parsed: RawSynthesis;
  try {
    parsed = JSON.parse(extractJson(result.text)) as RawSynthesis;
  } catch (error) {
    // Parse failure (OK-9 W4): never throw the panel away. Return both role
    // outputs verbatim, flagged, so the caller keeps the run record honest
    // (gate outcome "not-run") instead of losing the run or gating a merge
    // that does not exist. AttributionError still throws — an ATTRIBUTED but
    // unattributable merge is an invariant breach, not a parse hiccup.
    return {
      consensus: [],
      divergences: [],
      discarded: [],
      blindSpots: [],
      raw: result.text,
      modelId: model.id,
      usage: result.usage,
      synthesisError: error instanceof Error ? error.message : String(error),
      fallbackOutputs: [architect, builder],
    };
  }

  return {
    consensus: isStringArray(parsed.consensus) ? parsed.consensus : [],
    divergences: narrowItems(parsed.divergences, isDivergence, "divergence"),
    discarded: narrowItems(parsed.discarded, isDiscard, "discard"),
    blindSpots: isStringArray(parsed.blindSpots) ? parsed.blindSpots : [],
    comparison: narrowComparison(parsed.comparison),
    raw: result.text,
    modelId: model.id,
    usage: result.usage,
  };
}
