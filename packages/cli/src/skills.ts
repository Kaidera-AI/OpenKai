/**
 * openkai skills — capability management (E002 Inc 05).
 *
 * List / add / remove skills against the `.agents/skills/` directory and the
 * Cortex skill registry. Mirrors the API shapes from
 * `.agents/scripts/cortex-skill` (POST /skills, GET /skills,
 * DELETE /skills/{slug}, POST /skills/{slug}/bind) via the CortexClient — no
 * shelling out.
 *
 * `add` accepts a local path (copies the skill folder into `.agents/skills/`)
 * and registers it with the registry. `remove` deletes from the registry and
 * the local folder. `list` prints a compact table. `bind` binds a skill to a
 * role or agent.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { CortexClient, DEFAULT_CORTEX_API_URL } from "@kaidera/openkai-core";
import type {
  SkillInfo,
  SkillRegisterPayload,
} from "@kaidera/openkai-core";

/** Options shared by all skills subcommands. */
export interface SkillsOptions {
  project?: string;
  api?: string;
  agent?: string;
}

export interface SkillsListOptions extends SkillsOptions {}

export interface SkillsAddOptions extends SkillsOptions {
  /** Local path to the skill folder (must contain SKILL.md). */
  source: string;
  /** Override the scope (default: from frontmatter or "global"). */
  scope?: string;
}

export interface SkillsRemoveOptions extends SkillsOptions {
  /** The skill slug to remove. */
  slug: string;
}

export interface SkillsBindOptions extends SkillsOptions {
  /** The skill slug to bind. */
  slug: string;
  /** The role or agent name to bind to. */
  to: string;
  /** "role" (default) or "agent". */
  kind?: string;
}

const SKILLS_REL = ".agents/skills";

/** Resolve the .agents/skills directory (cwd-relative, matching cortex-skill). */
function skillsDir(): string {
  return path.join(process.cwd(), SKILLS_REL);
}

/** Slugify a name: lowercase, non-alphanumeric → dashes, trimmed. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "skill";
}

/**
 * Minimal YAML frontmatter parser for SKILL.md — extracts top-level
 * `key: value` pairs (no nested structures, matching cortex-skill's
 * fallback). Returns a Record<string,string>.
 */
function parseFrontmatter(text: string): Record<string, string> {
  const front: Record<string, string> = {};
  const stripped = text.replace(/^\s+/, "");
  if (!stripped.startsWith("---")) return front;
  const parts = stripped.split("---", 3);
  if (parts.length < 3) return front;
  const block = parts[1];
  if (!block) return front;
  for (const line of block.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes(":")) continue;
    if (trimmed.charAt(0) === " " || trimmed.charAt(0) === "\t" || trimmed.charAt(0) === "-") continue;
    const idx = trimmed.indexOf(":");
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    let val = trimmed.slice(idx + 1).trim();
    val = val.replace(/^["']|["']$/g, "");
    front[key] = val;
  }
  return front;
}

/** SHA-256 hex of a file (Node.js crypto, no new deps). */
async function sha256File(filePath: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const data = await fs.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

/** Build a CortexClient from options + env defaults. */
function makeClient(options: SkillsOptions): CortexClient {
  const project = options.project ?? process.env.CORTEX_PROJECT ?? "openkai";
  return new CortexClient({
    baseUrl: options.api ?? process.env.CORTEX_API_URL ?? DEFAULT_CORTEX_API_URL,
    project,
    agent: options.agent,
  });
}

/** Find SKILL.md in a directory (root or first subdir, max depth 3). */
async function findSkillMd(root: string): Promise<string | null> {
  const direct = path.join(root, "SKILL.md");
  try {
    await fs.access(direct);
    return direct;
  } catch {
    // search subdirs
  }
  async function search(dir: string, depth: number): Promise<string | null> {
    if (depth <= 0) return null;
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        const found = await search(full, depth - 1);
        if (found) return found;
      } else if (entry === "SKILL.md") {
        return full;
      }
    }
    return null;
  }
  return search(root, 3);
}

/** Format a skill row for the list table. */
function formatSkillRow(r: SkillInfo, widths: { slug: number; scope: number }): string {
  const slug = (r.skill_slug ?? "").padEnd(widths.slug).slice(0, widths.slug);
  const scope = (r.scope ?? "").padEnd(widths.scope).slice(0, widths.scope);
  const ver = (r.version ?? "").slice(0, 5).padEnd(5);
  const desc = (r.description ?? "").replace(/\n/g, " ").slice(0, 50);
  return `  ${slug}  ${scope}  ${ver}  ${desc}`;
}

// ── list ────────────────────────────────────────────────────────────────────

export async function runSkillsList(options: SkillsListOptions): Promise<number> {
  const client = makeClient(options);
  try {
    const skills = await client.listSkills();
    if (skills.length === 0) {
      process.stdout.write("No skills registered.\n");
      return 0;
    }
    const w = {
      slug: Math.max(4, ...skills.map((s) => s.skill_slug.length)),
      scope: Math.max(5, ...skills.map((s) => (s.scope ?? "").length)),
    };
    process.stdout.write(`  ${"SLUG".padEnd(w.slug)}  ${"SCOPE".padEnd(w.scope)}  VER   DESCRIPTION\n`);
    process.stdout.write(`  ${"-".repeat(w.slug)}  ${"-".repeat(w.scope)}  -----  ${"-".repeat(40)}\n`);
    for (const s of skills) {
      process.stdout.write(`${formatSkillRow(s, w)}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

// ── add ──────────────────────────────────────────────────────────────────────

export async function runSkillsAdd(options: SkillsAddOptions): Promise<number> {
  // Resolve source: local path (directory or file).
  let sourceDir: string;
  try {
    const stat = await fs.stat(options.source);
    sourceDir = stat.isDirectory() ? options.source : path.dirname(options.source);
  } catch {
    process.stderr.write(`ERROR: source "${options.source}" not found.\n`);
    return 1;
  }

  // Find SKILL.md.
  const skillMdPath = await findSkillMd(sourceDir);
  if (!skillMdPath) {
    process.stderr.write(`ERROR: no SKILL.md found in "${options.source}".\n`);
    return 2;
  }

  const skillFolder = path.dirname(skillMdPath);
  const skillMd = await fs.readFile(skillMdPath, "utf-8");
  const fm = parseFrontmatter(skillMd);

  const name = fm["name"] ?? "";
  const description = fm["description"] ?? "";
  const fmScope = fm["scope"] ?? "";
  const scope = options.scope ?? fmScope ?? "global";
  const slug = slugify(name || path.basename(skillFolder));

  // Body hash + body ref.
  const bodyHash = await sha256File(skillMdPath);

  // Copy skill folder → .agents/skills/<slug>/.
  const dest = path.join(skillsDir(), slug);
  await fs.mkdir(skillsDir(), { recursive: true });
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  await copyDir(skillFolder, dest);

  const bodyRef = `${SKILLS_REL}/${slug}/SKILL.md`;

  // Register with Cortex.
  const payload: SkillRegisterPayload = {
    skill_slug: slug,
    scope,
    body_ref: bodyRef,
    body_hash: bodyHash,
    version: "1",
  };
  if (name) payload.name = name;
  if (description) payload.description = description;

  const client = makeClient(options);
  try {
    await client.registerSkill(payload);
    process.stdout.write(`Registered ${slug} · ${scope} · ${dest}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`ERROR: registration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

/** Recursively copy a directory (no new deps). */
async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// ── remove ───────────────────────────────────────────────────────────────────

export async function runSkillsRemove(options: SkillsRemoveOptions): Promise<number> {
  const client = makeClient(options);
  try {
    await client.deleteSkill(options.slug);
  } catch (error) {
    process.stderr.write(`ERROR: registry delete failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  // Remove from .agents/skills/<slug>/.
  const dest = path.join(skillsDir(), options.slug);
  try {
    await fs.rm(dest, { recursive: true, force: true });
  } catch {
    // folder may not exist locally; registry removal is the primary action
  }

  process.stdout.write(`Removed ${options.slug}\n`);
  return 0;
}

// ── bind ──────────────────────────────────────────────────────────────────────

export async function runSkillsBind(options: SkillsBindOptions): Promise<number> {
  const client = makeClient(options);
  const kind = options.kind ?? "role";
  try {
    await client.bindSkill(options.slug, {
      subject_kind: kind,
      subject: options.to,
    });
    process.stdout.write(`Bound ${options.slug} -> ${options.to} (${kind})\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`ERROR: bind failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}