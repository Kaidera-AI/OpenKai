/**
 * Prompt stash + frecency-ranked history (scope §1.4).
 *
 * Two pure-function cores plus a thin local-state store. The scope §3 verify
 * rule: frecency ordering + stash push/pop are **pure functions** — tested
 * without the TUI. The persistence layer (read/write `.openkai/`) is a small
 * JSON wrapper; it is the only I/O in this module.
 *
 * - {@link PromptStash}: a LIFO draft stack (Ctrl+S to stash a draft, Ctrl+S
 *   on an empty composer to pop the top back in).
 * - {@link rankFrecency} / {@link frecencyScore}: pure ranking by
 *   frequency × recency decay.
 * - {@link FrecencyHistory}: persists `text -> {count, lastUsed}` under
 *   `.openkai/history.json` (gitignored local state, scope §1.4).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ── Prompt stash (pure) ─────────────────────────────────────────────────────

/**
 * A LIFO draft stack (scope §1.4). Pure array ops over a private array; no
 * I/O, no timers. `push` ignores empty drafts so a stray Ctrl+S on an empty
 * composer does not push a phantom frame.
 */
export class PromptStash {
  private readonly stack: string[] = [];
  /** Push a draft onto the stack. Empty drafts are ignored. */
  push(text: string): void {
    if (text.length > 0) this.stack.push(text);
  }
  /** Pop the most-recently stashed draft, or `undefined` when empty. */
  pop(): string | undefined {
    return this.stack.pop();
  }
  /** Peek the top without popping. */
  peek(): string | undefined {
    return this.stack[this.stack.length - 1];
  }
  /** Number of stashed drafts. */
  get size(): number {
    return this.stack.length;
  }
  /** True when the stash holds nothing. */
  get isEmpty(): boolean {
    return this.stack.length === 0;
  }
}

// ── Frecency (pure) ─────────────────────────────────────────────────────────

/** One persisted prompt's frecency bookkeeping. */
export interface FrecencyEntry {
  /** The prompt text (also the dedup key). */
  text: string;
  /** Submission count. */
  count: number;
  /** Last-submission epoch ms. */
  lastUsed: number;
}

/** One hour in ms (the recency-decay timescale). */
const HOUR_MS = 3_600_000;

/**
 * Frecency score: `count / (1 + ageHours)` (scope §1.4 — frequency + recency).
 * Pure: depends only on the entry + `now`. Higher is better; recency decays so
 * a frequently-used old prompt can still outrank a fresh one-shot, but a
 * just-submitted prompt always scores at least its count.
 */
export function frecencyScore(entry: FrecencyEntry, now: number): number {
  const ageMs = Math.max(0, now - entry.lastUsed);
  const ageHours = ageMs / HOUR_MS;
  return entry.count / (1 + ageHours);
}

/**
 * Rank entries by frecency score, descending (best first). Pure: returns a new
 * array, leaves the input untouched. Ties break on `lastUsed` (newer first),
 * then `text` (stable, deterministic) so the order is reproducible in tests.
 */
export function rankFrecency(entries: FrecencyEntry[], now: number): FrecencyEntry[] {
  return [...entries]
    .map((entry) => ({ entry, score: frecencyScore(entry, now) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.entry.lastUsed !== a.entry.lastUsed) return b.entry.lastUsed - a.entry.lastUsed;
      return a.entry.text < b.entry.text ? -1 : a.entry.text > b.entry.text ? 1 : 0;
    })
    .map((r) => r.entry);
}

// ── Local persistence (the only I/O here) ───────────────────────────────────

/** Persisted shape under `.openkai/history.json`. */
export interface FrecencyStateFile {
  /** `text -> entry` map. Stored as an object keyed by the prompt text. */
  entries: Record<string, FrecencyEntry>;
}

/**
 * Frecency history persisted under `.openkai/history.json` (scope §1.4). The
 * ranking is the pure {@link rankFrecency}; this class only reads/writes JSON
 * and updates `count` / `lastUsed`. Missing file -> empty (first run).
 */
export class FrecencyHistory {
  private entries = new Map<string, FrecencyEntry>();

  constructor(private readonly filePath: string) {}

  /** Load from disk. Missing/corrupt file -> empty (no throw). */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as FrecencyStateFile;
      if (parsed && typeof parsed.entries === "object") {
        this.entries = new Map(Object.entries(parsed.entries));
      }
    } catch {
      // Missing or corrupt: start empty.
      this.entries = new Map();
    }
  }

  /** Persist to disk (atomic-ish: mkdir -p then write). */
  async save(): Promise<void> {
    const file: FrecencyStateFile = { entries: Object.fromEntries(this.entries) };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(file, null, 2), "utf-8");
  }

  /** Record a submission: bump `count` + set `lastUsed`. */
  record(text: string, now: number): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const existing = this.entries.get(trimmed);
    if (existing) {
      existing.count += 1;
      existing.lastUsed = now;
    } else {
      this.entries.set(trimmed, { text: trimmed, count: 1, lastUsed: now });
    }
  }

  /** All entries (read-only view for ranking). */
  entriesList(): FrecencyEntry[] {
    return [...this.entries.values()];
  }

  /** Frecency-ranked entries, best first (delegates to the pure ranker). */
  ranked(now: number): FrecencyEntry[] {
    return rankFrecency(this.entriesList(), now);
  }
}
