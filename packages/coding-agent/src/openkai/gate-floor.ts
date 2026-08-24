/**
 * openkai/gate-floor (E021 F3) — the deny floor, ported from the 0.84 line's
 * permissions.ts (matchesDenyFloor walks every ancestor prefix; the F10
 * node-vs-contents discipline holds: a floor glob denies the directory NODE
 * and everything beneath it).
 */

import * as fs from "node:fs";
import * as path from "node:path";

const DENY_FLOOR: readonly string[] = [
  ".env",
  ".env.*",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa*",
  "**/id_ed25519*",
  "**/id_ecdsa*",
  "**/id_dsa*",
  ".git/config",
  ".git-credentials",
  "**/.ssh",
  "**/.gnupg",
  "**/.aws",
  "**/.azure",
  "**/.kube",
  ".npmrc",
  ".pypirc",
  ".netrc",
  "**/*.p12",
  "**/*.pfx",
  "**/*.keystore",
  "**/*.jks",
];

const globCache = new Map<string, RegExp>();

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

/** Canonicalise `target` against `cwd` and return the matched floor pattern. */
export function floorMatchFor(cwd: string, target: string): string | undefined {
  const canonical = resolveCanonical(cwd, target);
  const rel = path.relative(resolveCanonical(cwd, "."), canonical);
  return matchesDenyFloor(rel);
}

/** True when the target escapes the working folder (deny-by-containment). */
export function outsideCwd(cwd: string, target: string): boolean {
  const canonical = resolveCanonical(cwd, target);
  const rel = path.relative(resolveCanonical(cwd, "."), canonical);
  return rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}
