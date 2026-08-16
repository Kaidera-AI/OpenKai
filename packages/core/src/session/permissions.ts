/**
 * Permission policy engine (P4b scope §3).
 *
 * Pure, synchronous, no I/O. {@link evaluate} resolves a tool call against a
 * rule set to one of `allow` / `ask` / `deny`. This is the single gate holding
 * back `write_file` / `edit_file` / `bash` (scope §1) — the engine itself does
 * not execute, prompt, or format display; the {@link PermissionGate}
 * (permission-gate.ts) orchestrates I/O around this decision.
 *
 * Rule ordering is **last-match-wins** (the opencode semantic — a later rule
 * overrides an earlier one; do not invert it). Sitting *under* the rules is a
 * **terminal deny floor**: a path that matches the floor is `deny` regardless
 * of any later `allow` rule. A permission engine without a deny floor is
 * theatre; the floor is the substance (scope §3).
 *
 * Two engine-level guarantees that no shipped rule set may violate:
 *  - **`bash` never resolves to `allow`.** Even a trailing `allow **` rule
 *    cannot promote bash past `ask` — the engine clamps it. This is the
 *    "dangerous one" backstop (scope §9).
 *  - **Paths outside `cwd` resolve to `deny`.** P4a's `resolveWithin` already
 *    refuses traversal in the read tools; the policy layer agrees rather than
 *    duplicating the check inconsistently (scope §3).
 *
 * Rules are a plain array literal here — no config file, no schema, no loader
 * (scope §3). Config-driven rules land when there is a second consumer.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Canonical path resolution (E001 security gate, findings 1–3).
 *
 * `path.resolve` is purely lexical: an in-cwd symlink to an outside-cwd
 * target passes every lexical check. This resolves the REAL path of the
 * longest existing ancestor and re-appends the (possibly not-yet-existing)
 * tail, so symlinks anywhere in the existing prefix are followed to their
 * true location before containment and floor checks run. Works for
 * `write_file` targets that do not exist yet.
 */
export function resolveCanonical(cwd: string, target: string): string {
  const resolved = path.resolve(cwd, target);
  const tail: string[] = [];
  let cursor = resolved;
  for (;;) {
    try {
      const real = fs.realpathSync(cursor);
      return tail.length === 0 ? real : path.join(real, ...tail.reverse());
    } catch {
      const parent = path.dirname(cursor);
      if (parent === cursor) return resolved; // filesystem root: lexical fallback
      tail.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

/** A policy decision for one tool call. */
export type PermissionDecision = "allow" | "ask" | "deny";

/**
 * One rule. A rule matches a tool call when its (optional) `tool` equals the
 * tool name AND its (optional) `path` glob matches the call's resolved path
 * (relative to cwd). Omitting `tool` matches any tool; omitting `path` matches
 * any path (including pathless tools like `bash`). Last-match-wins.
 */
export interface PermissionRule {
  /** Exact tool name to match, or `undefined` for any tool. */
  tool?: string;
  /** Glob matched against the path relative to cwd, or `undefined` for any. */
  path?: string;
  /** Decision emitted when this rule matches. */
  decision: PermissionDecision;
  /** Optional human label surfaced in the `permission_request` `rule` field. */
  label?: string;
}

/**
 * The deny floor — terminal path globs that always resolve to `deny`, checked
 * *before* the rule walk so no later `allow` rule can override them (scope §3).
 * Matches against the path relative to cwd; a bare-name pattern (no `/`) also
 * matches the basename, so `.env` denies `subdir/.env` as well as `./.env`, and
 * every pattern also matches an ancestor DIRECTORY (see {@link matchesDenyFloor}).
 *
 * Node-vs-contents discipline (E001 finding F10): a protected concept must hold
 * the directory NODE as well as its contents, otherwise `list_files` on the
 * node enumerates the protected filenames. {@link matchesDenyFloor} walks every
 * ancestor prefix, so a pattern that matches the node (e.g. the glob `**` + `/.ssh`) also
 * denies every path beneath it — there is no need for a trailing contents-only form,
 * and a contents-only form alone would NOT match the bare node (the F10 gap).
 * Every entry here was checked to match its node, not just its leaves.
 */
const DENY_FLOOR: readonly string[] = [
  ".env",
  ".env.*",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa*",
  ".git/config",
  "**/.ssh",
];

/**
 * The shipped rule set. Empty by design: the per-tool defaults
 * (read → allow, write/edit → ask, bash → ask) plus the terminal deny floor
 * already encode the P4b posture. Tests inject rules to prove last-match-wins
 * ordering; production leaves this as-is (scope §3: "Rules are a plain array
 * literal in this slice — no config file, no schema, no loader").
 */
export const DEFAULT_RULES: readonly PermissionRule[] = [];

/** The default decision for a tool when no rule matches (before the floor). */
function defaultForTool(toolName: string): PermissionDecision {
  switch (toolName) {
    case "read_file":
    case "list_files":
    case "grep":
      return "allow";
    case "write_file":
    case "edit_file":
      return "ask";
    case "bash":
      return "ask";
    default:
      // Unknown tool — fail safe (ask), never auto-allow.
      return "ask";
  }
}

/** Narrow `unknown` args to a record without throwing. */
function asRecord(args: unknown): Record<string, unknown> {
  return args !== null && typeof args === "object" ? (args as Record<string, unknown>) : {};
}

/**
 * Evaluate a tool call's policy decision (scope §3 contract).
 *
 * `rules` defaults to {@link DEFAULT_RULES}; tests inject rules to prove
 * last-match-wins ordering. Pure — no I/O, no side effects.
 */
export function evaluate(
  toolName: string,
  args: unknown,
  cwd: string,
  rules: readonly PermissionRule[] = DEFAULT_RULES,
): PermissionDecision {
  return evaluateWithReason(toolName, args, cwd, rules).decision;
}

/** The decision plus a short human reason for the `permission_request` event. */
export function evaluateWithReason(
  toolName: string,
  args: unknown,
  cwd: string,
  rules: readonly PermissionRule[] = DEFAULT_RULES,
): { decision: PermissionDecision; reason: string } {
  const argObj = asRecord(args);

  // ── bash: never allow (engine guard, scope §3 + §9) ──────────────────────
  if (toolName === "bash") {
    let decision: PermissionDecision = "ask";
    let reason = "ask — bash requires approval (never auto-allowed)";
    for (const rule of rules) {
      if (ruleMatches(rule, toolName, undefined)) {
        decision = rule.decision;
        reason = `${rule.decision} — rule ${rule.label ?? describeRule(rule)}`;
      }
    }
    if (decision === "allow") {
      return { decision: "ask", reason: "ask — bash can never be auto-allowed" };
    }
    return { decision, reason };
  }

  // ── file tools: resolve the path, apply the terminal floor ──────────────
  const rawPath = typeof argObj.path === "string" ? argObj.path : undefined;
  let relPath: string | undefined;
  if (rawPath !== undefined) {
    // Canonicalise BOTH sides — symlinks inside cwd (and cwd itself, e.g.
    // macOS /tmp -> /private/tmp) resolve to their real location first.
    const canonicalCwd = resolveCanonical(cwd, ".");
    const resolved = resolveCanonical(cwd, rawPath);
    if (resolved !== canonicalCwd && !resolved.startsWith(canonicalCwd + path.sep)) {
      return { decision: "deny", reason: "deny — path outside working directory" };
    }
    relPath = path.relative(canonicalCwd, resolved);
    const floor = matchesDenyFloor(relPath);
    if (floor !== undefined) {
      return { decision: "deny", reason: `deny — protected path (${floor})` };
    }
  }

  // ── last-match-wins rule walk ───────────────────────────────────────────
  let decision = defaultForTool(toolName);
  let reason = `${decision} — default for ${toolName}`;
  for (const rule of rules) {
    if (ruleMatches(rule, toolName, relPath)) {
      decision = rule.decision;
      reason = `${rule.decision} — rule ${rule.label ?? describeRule(rule)}`;
    }
  }
  return { decision, reason };
}

/** Describe a rule for the reason string. */
function describeRule(rule: PermissionRule): string {
  if (rule.tool && rule.path) return `"${rule.tool} ${rule.path}"`;
  if (rule.path) return `"${rule.path}"`;
  if (rule.tool) return `"${rule.tool}"`;
  return "(match all)";
}

/** True if `rule` matches the call. Path rules do not match pathless tools. */
function ruleMatches(
  rule: PermissionRule,
  toolName: string,
  relPath: string | undefined,
): boolean {
  if (rule.tool !== undefined && rule.tool !== toolName) return false;
  if (rule.path !== undefined) {
    if (relPath === undefined) return false; // path rule can't match a pathless tool
    if (!pathGlobMatch(rule.path, relPath)) return false;
  }
  return true;
}

/**
 * Return the deny-floor pattern that `relPath` matches, or `undefined`.
 *
 * A protected path protects everything **under** it, so the floor is tested
 * against every ancestor prefix — not just the full path. `.env/production`
 * is denied by the `.env` pattern and `server.pem/privkey` by the `*.pem` one:
 * a protected NAME used as a DIRECTORY component holds the same secrets the
 * leaf file would, and `.env/` directories are a real per-environment
 * convention (E001 finding F4). Because the walk tests each prefix, a node
 * pattern (e.g. the `**` + `/.ssh` glob) also denies every path beneath it — the node holds
 * the contents (E001 finding F10).
 */
function matchesDenyFloor(relPath: string): string | undefined {
  const parts = relPath.split(/[\\/]/).filter((p) => p.length > 0);
  for (let i = 1; i <= parts.length; i += 1) {
    const prefix = parts.slice(0, i).join("/");
    for (const pattern of DENY_FLOOR) {
      if (pathGlobMatch(pattern, prefix)) return pattern;
    }
  }
  return undefined;
}

/**
 * Tool-layer floor check: canonicalise `target` against `cwd` and return the
 * matched deny-floor pattern, or `undefined` when the path is clean. The
 * floor is a hard boundary — it applies even to tools that never consult
 * the policy engine (the read-only trio; E001 security finding 2).
 */
export function floorDeny(cwd: string, target: string): string | undefined {
  const canonicalCwd = resolveCanonical(cwd, ".");
  const resolved = resolveCanonical(cwd, target);
  const relPath = path.relative(canonicalCwd, resolved);
  return matchesDenyFloor(relPath);
}

// ── Minimal glob → regex (no dependency; P1's dependency-free ethos) ─────────

/** Cached regexes (globs are small + repeated). */
const globCache = new Map<string, RegExp>();

/** Convert a glob to an anchored RegExp supporting `**`, `*`, `?`. */
function globToRegex(glob: string): RegExp {
  const cached = globCache.get(glob);
  if (cached) return cached;

  let re = "^";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          // `**/` — zero or more leading directories
          re += "(?:.*/)?";
          i += 3;
        } else {
          // bare `**` — match anything (including `/`)
          re += ".*";
          i += 2;
        }
      } else {
        // `*` — within one path segment (no `/`)
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else if (".+^$(){}|[]\\".includes(c)) {
      re += "\\" + c;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  re += "$";
  const rx = new RegExp(re);
  globCache.set(glob, rx);
  return rx;
}

/**
 * Match a glob against a relative path. Matching is case-insensitive and
 * NFC-normalised: on case-insensitive filesystems (default APFS, NTFS) the
 * lexical name is not the file's identity — `.ENV` IS `.env` there, so the
 * floor must treat them alike (E001 security finding 2). A bare-name
 * pattern (no `/`) also matches the basename, so `.env` denies nested
 * `.env` files; a SLASHED pattern also matches at any depth, so
 * `.git/config` denies `vendor/dep/.git/config` (finding 3).
 */
function pathGlobMatch(pattern: string, relPath: string): boolean {
  const normPattern = pattern.normalize("NFC").toLowerCase();
  const subject = relPath.normalize("NFC").toLowerCase();
  const rx = globToRegex(normPattern);
  if (rx.test(subject)) return true;
  if (!normPattern.includes("/")) {
    const base = subject.split("/").pop();
    if (base !== undefined && rx.test(base)) return true;
  } else {
    const anywhere = globToRegex(`**/${normPattern}`);
    if (anywhere.test(subject)) return true;
  }
  return false;
}
