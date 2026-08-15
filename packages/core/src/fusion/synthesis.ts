/**
 * FU-2 — the synthesis step with provenance.
 *
 * A third completion (architect model, FRESH session) reads both role
 * outputs and emits the structured merge: consensus / divergence (kept,
 * attributed) / discarded (with reason) / blind spots. Attribution tags are
 * mandatory: any divergence or discard that fails to attribute its positions
 * throws {@link AttributionError} — an unattributed merge is a regression to
 * a single opinion (E016 §3.2), and it fails loudly here, not in review.
 */

import type { Api, Model, StreamFunction } from "@earendil-works/pi-ai";
import { complete } from "./complete.js";
import {
  AttributionError,
  type RoleOutput,
  type SynthesisArtifact,
} from "./types.js";

const SYNTHESIS_SYSTEM =
  "You are the SYNTHESISER in a fusion run: a fresh, third session with no " +
  "stake in either role. Merge the ARCHITECT and BUILDER outputs for the task " +
  "into one structured artefact. Rules: consensus lists only what both support; " +
  "every divergence keeps both positions WITH attribution; every discard names " +
  "a reason and whose position it was; blind spots are what BOTH missed. " +
  "Output ONLY a JSON object with exactly these keys: " +
  '{"consensus": string[], "divergences": [{"topic": string, "architect": string, ' +
  '"builder": string, "kept": "architect"|"builder"|"both"}], "discarded": ' +
  '[{"item": string, "reason": string, "by": "architect"|"builder"}], ' +
  '"blindSpots": string[]}. No prose, no markdown fence.';

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
  consensus?: unknown;
  divergences?: unknown;
  discarded?: unknown;
  blindSpots?: unknown;
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
  streamFn: StreamFunction,
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

  const parsed = JSON.parse(extractJson(result.text)) as RawSynthesis;

  return {
    consensus: isStringArray(parsed.consensus) ? parsed.consensus : [],
    divergences: narrowItems(parsed.divergences, isDivergence, "divergence"),
    discarded: narrowItems(parsed.discarded, isDiscard, "discard"),
    blindSpots: isStringArray(parsed.blindSpots) ? parsed.blindSpots : [],
    raw: result.text,
    modelId: model.id,
    usage: result.usage,
  };
}
