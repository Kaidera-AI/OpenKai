/**
 * Magic keywords (E017 UK round 4) — the OMP-derived machinery plus the
 * OpenKai ultra-turn routing.
 *
 *  1. Boundary matching: prose-delimited only — never code spans, fenced
 *     blocks, XML sections, paths, identifiers, or capitalised forms.
 *  2. maskNonProse: length-preserving (indices address the original).
 *  3. Painter: zero-width SGR only; phase rotates the gradient; masking
 *     applies to painting too.
 *  4. Config gating: magicKeywords.{enabled,ultrathink,ultrareview}.
 *  5. Ultra turns: ultrathink routes to the fusion panel with the hidden
 *     notice; the visible transcript/store carry the text AS TYPED;
 *     ultrareview refuses cleanly without a diff.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  detectMagicKeywords,
  keywordInProse,
  magicKeywordRegex,
  maskNonProse,
  paintMagicKeywords,
  paintShimmerLabel,
  shimmerPhase,
  ULTRAREVIEW_NOTICE,
  ULTRATHINK_NOTICE,
} from "../dist/tui/magic-keywords.js";
import { visibleWidth } from "@earendil-works/pi-tui";

// ── 1. boundary matching ───────────────────────────────────────────────────

test("ultrathink matches standalone prose only", () => {
  const word = magicKeywordRegex("ultrathink");
  assert.ok(keywordInProse("ultrathink about the failure modes", word));
  assert.ok(keywordInProse("please ultrathink, then answer", word), "trailing comma is prose");
  assert.ok(keywordInProse('he said "ultrathink" quietly', word), "quotes may touch");
  assert.ok(!keywordInProse("Ultrathink about it", word), "capitalised never fires");
  assert.ok(!keywordInProse("ultrathinking hard", word), "no partial word");
  assert.ok(!keywordInProse("edit ultrathink.ts now", word), "file extension binds");
  assert.ok(!keywordInProse("see src/ultrathink", word), "path segment binds");
  assert.ok(!keywordInProse("call ultrathink() first", word), "call syntax binds");
  assert.ok(!keywordInProse("foo::ultrathink", word), "symbol reference binds");
  assert.ok(!keywordInProse("the-ultrathink", word), "hyphen binds");
});

test("keywords inside code spans, fences, and XML never match", () => {
  const word = magicKeywordRegex("ultrathink");
  assert.ok(!keywordInProse("run `ultrathink` verbatim", word), "inline code span");
  assert.ok(!keywordInProse("```\nultrathink in a fence\n```", word), "fenced block");
  assert.ok(!keywordInProse("<system-notice>ultrathink</system-notice>", word), "XML section");
  assert.ok(!keywordInProse("<!-- ultrathink -->", word), "HTML comment");
  assert.ok(keywordInProse("`<code>` then ultrathink for real", word), "prose after a span");
});

test("ultrareview matches with the same discipline", () => {
  const word = magicKeywordRegex("ultrareview");
  assert.ok(keywordInProse("ultrareview this diff before merge", word));
  assert.ok(!keywordInProse("ultrareview.md", word));
});

// ── 2. maskNonProse ─────────────────────────────────────────────────────────

test("maskNonProse preserves length and prose", () => {
  const text = "keep `code ultrathink` and ultrathink";
  const masked = maskNonProse(text);
  assert.equal(masked.length, text.length, "indices map 1:1");
  assert.ok(masked.endsWith("and ultrathink"), "prose untouched");
  assert.ok(!masked.includes("code ultrathink"), "code span blanked");
});

// ── 3. painter ──────────────────────────────────────────────────────────────

test("painting adds zero-width SGR only", () => {
  const text = "please ultrathink about this";
  const painted = paintMagicKeywords(text, 0);
  assert.ok(painted.includes("\x1b["), "SGR present");
  assert.equal(visibleWidth(painted), visibleWidth(text), "visible width unchanged");
  const still = paintMagicKeywords("nothing to paint here", 0);
  assert.equal(still, "nothing to paint here", "no keyword, no paint");
});

test("phase rotates the gradient; code-span keywords never paint", () => {
  const text = "ultrathink";
  const a = paintMagicKeywords(text, 0);
  const b = paintMagicKeywords(text, 0.5);
  assert.notEqual(a, b, "different phases paint differently — the shimmer moves");
  assert.equal(paintMagicKeywords("`ultrathink`", 0), "`ultrathink`", "masked matches stay plain");
});

test("paintShimmerLabel paints any label with the keyword palette", () => {
  const label = paintShimmerLabel("ultrathinking…", "ultrathink", 0.25);
  assert.ok(label.includes("\x1b["), "gradient SGR present");
  assert.equal(visibleWidth(label), visibleWidth("ultrathinking…"));
  assert.equal(typeof shimmerPhase(), "number");
});

// ── 4. config gating ────────────────────────────────────────────────────────

test("magicKeywords config gates detection and painting", () => {
  const home = mkdtempSync(path.join(tmpdir(), "openkai-mk-home-"));
  const prev = process.env.OPENKAI_HOME;
  process.env.OPENKAI_HOME = home;
  try {
    assert.deepEqual(detectMagicKeywords("ultrathink and ultrareview"), ["ultrathink", "ultrareview"], "default-on");

    writeFileSync(path.join(home, "config.json"), JSON.stringify({ magicKeywords: { enabled: false } }));
    assert.deepEqual(detectMagicKeywords("ultrathink"), [], "global switch gates all");
    assert.equal(paintMagicKeywords("ultrathink", 0), "ultrathink", "gated keywords stay plain");

    writeFileSync(
      path.join(home, "config.json"),
      JSON.stringify({ magicKeywords: { enabled: true, ultrareview: false } }),
    );
    assert.deepEqual(detectMagicKeywords("ultrathink and ultrareview"), ["ultrathink"], "per-keyword gate");
  } finally {
    if (prev === undefined) delete process.env.OPENKAI_HOME;
    else process.env.OPENKAI_HOME = prev;
  }
});

// ── 5. notices ──────────────────────────────────────────────────────────────

test("notices are hidden system-attributed instructions", () => {
  assert.ok(ULTRATHINK_NOTICE.includes("Multi-step reasoning"));
  assert.ok(ULTRAREVIEW_NOTICE.includes("Adversarial review"));
});

// ── 6. the settings cycle ───────────────────────────────────────────────────

test("settings cycle walks all → think → review → off and persists", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "openkai-mk-cycle-"));
  mkdirSync(home, { recursive: true });
  const prev = process.env.OPENKAI_HOME;
  process.env.OPENKAI_HOME = home;
  try {
    const { readConfigFile } = await import("../dist/config.js");
    const settings = await import("../dist/tui/settings.js");
    // The cycle helper is module-local; exercise it through the overlay row.
    const overlay = new settings.SettingsOverlay(
      {
        pickModel() {},
        pickTheme() {},
        pickStatusline() {},
        pickPosture() {},
        setMemory() {},
        signIn() {},
        setStatusline() {},
        pickAutonomy() {},
        currentAutonomy: () => "off",
      },
      () => undefined,
      "interaction",
    );
    const row = (overlay as unknown as { rows: Array<{ value: string; description?: string; action?: () => string | undefined }> }).rows.find(
      (r) => r.value === "magicKeywords",
    );
    assert.ok(row, "interaction tab has the magic keywords row");
    assert.match(row.description ?? "", /ultrathink \+ ultrareview/);
    row.action?.();
    let slice = readConfigFile()["magicKeywords"] as Record<string, unknown>;
    assert.equal(slice["ultrareview"], false, "think-only persisted");
    row.action?.();
    slice = readConfigFile()["magicKeywords"] as Record<string, unknown>;
    assert.equal(slice["ultrathink"], false, "review-only persisted");
    assert.equal(slice["ultrareview"], true);
    row.action?.();
    slice = readConfigFile()["magicKeywords"] as Record<string, unknown>;
    assert.equal(slice["enabled"], false, "off persisted");
    row.action?.();
    slice = readConfigFile()["magicKeywords"] as Record<string, unknown>;
    assert.equal(slice["enabled"], true, "cycle returns to all-on");
  } finally {
    if (prev === undefined) delete process.env.OPENKAI_HOME;
    else process.env.OPENKAI_HOME = prev;
  }
});
