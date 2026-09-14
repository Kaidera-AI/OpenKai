import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type Step = { id?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, string> };
type Action = { inputs: Record<string, { default?: string }>; outputs: Record<string, { value: string }>; runs: { steps: Step[] } };
type Job = { needs?: string | string[]; outputs?: Record<string, string>; steps: Step[] };
const repository = resolve(import.meta.dir, "..");
const actionBytes = readFileSync(join(repository, ".github/actions/materialize-openkai-source/action.yml"), "utf8");
const action = Bun.YAML.parse(actionBytes) as Action;
const workflow = Bun.YAML.parse(readFileSync(join(repository, ".github/workflows/release.yml"), "utf8")) as { jobs: Record<string, Job> };
const actionStep = action.runs.steps[0];
const evidence = process.env.RECEIVER_EVIDENCE_DIR;
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
let root: string;
let sourceArchive: string;
let sequence = 0;
const cleanEnv: Record<string, string> = {
  PATH: process.env.PATH ?? "",
  LANG: "C.UTF-8", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
};
function command(file: string, args: string[], cwd: string) {
  const result = spawnSync(file, args, { cwd, env: { ...cleanEnv, HOME: join(root, "home"), TMPDIR: root }, encoding: "utf8", timeout: 20000 });
  if (result.error || result.status !== 0) throw new Error(`${file} ${args.join(" ")}: ${result.error ?? result.stderr}`);
  return result.stdout;
}
function put(path: string, contents: string) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, contents); }
function snapshot(path: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(dir: string, prefix: string) {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name); const relative = `${prefix}${name}`; const stat = lstatSync(file);
      if (stat.isSymbolicLink()) result[relative] = `link:${readlinkSync(file)}`;
      else if (stat.isDirectory()) { result[`${relative}/`] = `mode:${stat.mode & 0o777}`; visit(file, `${relative}/`); }
      else result[relative] = `mode:${stat.mode & 0o777}:sha256:${digest(readFileSync(file))}`;
    }
  }
  visit(path, ""); return result;
}
beforeAll(() => {
  for (const tool of ["node", "git", "tar", "rsync", "lsof", "bash"]) {
    const found = spawnSync("/bin/sh", ["-c", 'command -v "$1"', "prerequisite", tool], { encoding: "utf8", env: cleanEnv });
    if (found.status !== 0) throw new Error(`required receiver fixture prerequisite missing: ${tool}`);
  }
  root = mkdtempSync(join(tmpdir(), "openkai-receiver-"));
  mkdirSync(join(root, "home"));
  if (evidence) mkdirSync(evidence, { recursive: true });
  const git = join(root, "source"); mkdirSync(git);
  put(join(git, ".gitattributes"), "/products export-ignore\n");
  put(join(git, "unrelated.txt"), "must not enter product archive\n");
  put(join(git, "products/openkai/package.json"), '{"name":"fixture-product","version":"0.1.13"}\n');
  put(join(git, "products/openkai/packages/coding-agent/package.json"), '{"name":"fixture-engine","version":"0.1.13"}\n');
  put(join(git, "products/openkai/bin/openkai"), "#!/bin/sh\nprintf 'inert fixture\\n'\n");
  chmodSync(join(git, "products/openkai/bin/openkai"), 0o755);
  symlinkSync("bin/openkai", join(git, "products/openkai/cli"));
  command("git", ["-c", "core.hooksPath=/dev/null", "init", "--quiet"], git);
  command("git", ["add", "."], git);
  command("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Owned fixture", "-c", "user.email=fixture@invalid.example", "commit", "--quiet", "-m", "Owned receiver fixture"], git);
  sourceArchive = join(root, "source.tar.gz");
  command("git", ["archive", "--format=tar.gz", "--prefix=openkai-fork-v0.1.13/", "-o", sourceArchive, "HEAD:products/openkai"], git);
  if (evidence) writeFileSync(join(evidence, "source-fixture.json"), JSON.stringify({ fixtureOnly: true, gitSha: command("git", ["rev-parse", "HEAD"], git).trim(), archiveSha256: digest(readFileSync(sourceArchive)), product: snapshot(join(git, "products/openkai")) }, null, 2));
});
afterAll(() => {
  if (!root) return;
  const scan = spawnSync("lsof", ["-nP", "+D", root], { encoding: "utf8", env: cleanEnv });
  const valid = !scan.error && [0, 1].includes(scan.status ?? -1) && scan.stderr === "";
  const clean = valid && scan.stdout === "";
  if (evidence) writeFileSync(join(evidence, "cleanup.json"), JSON.stringify({ root, valid, clean, status: scan.status, error: scan.error?.message, stdout: scan.stdout, stderr: scan.stderr, signals: [], removed: clean }, null, 2));
  if (!clean) throw new Error(`receiver fixture cleanup scan not clean; retained ${root}`);
  rmSync(root, { recursive: true });
});

type Provenance = { version: string; source: { repository: string; tag: string; sha: string }; archive: { name: string; sha256: string }; releaseException: unknown };
function fixture(title: string, version = "0.1.13") {
  const dir = join(root, String(++sequence).padStart(3, "0"));
  const workspace = join(dir, "workspace"); const assets = join(dir, "assets"); const runner = join(dir, "runner"); const bin = join(dir, "bin");
  for (const path of [workspace, assets, runner, bin]) mkdirSync(path, { recursive: true });
  put(join(workspace, ".git/owned"), "preserve git\n"); put(join(workspace, "stale.txt"), "original workspace\n");
  const archiveName = `openkai-source-v${version}.tar.gz`; const provenanceName = `openkai-source-v${version}.provenance.json`;
  const archive = join(assets, archiveName); copyFileSync(sourceArchive, archive);
  const provenance: Provenance = { version, source: { repository: "Kaidera-AI/kaideraos", tag: `openkai/v${version}`, sha: "a".repeat(40) }, archive: { name: archiveName, sha256: digest(readFileSync(archive)) }, releaseException: null };
  put(join(bin, "gh"), `#!/usr/bin/env node
const fs = require("node:fs"); const path = require("node:path");
const expected = ["release", "download", "v" + process.env.VERSION, "--repo", "Kaidera-AI/OpenKai", "--pattern", ${JSON.stringify(archiveName)}, "--pattern", ${JSON.stringify(provenanceName)}, "--dir", path.join(process.env.RUNNER_TEMP, "openkai-release-handoff")];
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_COMMANDS, JSON.stringify(args) + "\\n");
if (JSON.stringify(args) !== JSON.stringify(expected)) throw new Error("unsupported fixture gh operation");
for (const name of [${JSON.stringify(archiveName)}, ${JSON.stringify(provenanceName)}]) fs.copyFileSync(path.join(process.env.FIXTURE_ASSETS, name), path.join(expected.at(-1), name));
`);
  chmodSync(join(bin, "gh"), 0o755);
  const original = snapshot(workspace);
  const inputs: Record<string, string> = { version, mode: "capture" };
  const writeProvenance = () => writeFileSync(join(assets, provenanceName), JSON.stringify(provenance));
  function run(options: { rawProvenance?: string; omit?: string } = {}) {
    writeProvenance();
    if (options.rawProvenance !== undefined) writeFileSync(join(assets, provenanceName), options.rawProvenance);
    if (options.omit) rmSync(join(assets, options.omit));
    const env: Record<string, string> = { ...cleanEnv, HOME: join(root, "home"), TMPDIR: runner, PATH: `${bin}:${cleanEnv.PATH}`, RUNNER_TEMP: runner, GITHUB_WORKSPACE: workspace, GITHUB_REPOSITORY: "Kaidera-AI/OpenKai", GITHUB_OUTPUT: join(dir, "outputs"), FIXTURE_ASSETS: assets, FIXTURE_COMMANDS: join(dir, "gh-commands.jsonl") };
    for (const [key, expression] of Object.entries(actionStep.env ?? {})) {
      const input = expression.match(/^\$\{\{ inputs\.([\w-]+) \}\}$/);
      if (input) env[key] = inputs[input[1]] ?? action.inputs[input[1]]?.default ?? "";
      else if (expression === "${{ github.token }}") env[key] = "inert-fixture-token";
      else throw new Error(`unsupported action env mapping: ${expression}`);
    }
    const result = spawnSync("bash", ["-c", actionStep.run!], { cwd: workspace, env, encoding: "utf8", timeout: 20000 });
    const output = existsSync(env.GITHUB_OUTPUT) ? readFileSync(env.GITHUB_OUTPUT, "utf8") : "";
    const outputs = Object.fromEntries(output.trim().split("\n").filter(Boolean).map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
    if (evidence) writeFileSync(join(evidence, `${String(sequence).padStart(3, "0")}.json`), JSON.stringify({ title, actionSha256: digest(actionBytes), inputs, provenance, archiveSha256: existsSync(archive) ? digest(readFileSync(archive)) : null, status: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr, output, original, final: snapshot(workspace), extraction: existsSync(join(runner, "openkai-release-source")) ? snapshot(join(runner, "openkai-release-source")) : {}, ghCommands: existsSync(env.FIXTURE_COMMANDS) ? readFileSync(env.FIXTURE_COMMANDS, "utf8") : "" }, null, 2));
    if (result.error) throw result.error;
    return { ...result, outputs };
  }
  function reject(options: { rawProvenance?: string; omit?: string } = {}) {
    expect(run(options).status).not.toBe(0);
    expect(snapshot(workspace)).toEqual(original);
    expect(existsSync(join(runner, "openkai-release-source")) ? snapshot(join(runner, "openkai-release-source")) : {}).toEqual({});
  }
  function layout(kind: "monorepo" | "mixed" | "missing-engine" | "missing-root" | "traversal" | "whitespace-member" | "space-suffixed-engine") {
    const staging = join(dir, "staging"); mkdirSync(staging);
    const prefix = `openkai-fork-v${version}`;
    if (kind === "monorepo") {
      put(join(staging, prefix, "products/openkai/package.json"), "{}\n");
      put(join(staging, prefix, "products/openkai/packages/coding-agent/package.json"), "{}\n");
    } else {
      if (kind !== "missing-root") put(join(staging, prefix, "package.json"), "{}\n");
      if (kind !== "missing-engine" && kind !== "space-suffixed-engine") put(join(staging, prefix, "packages/coding-agent/package.json"), "{}\n");
      if (kind === "mixed") put(join(staging, "unexpected.txt"), "not product source\n");
    }
    let members = readdirSync(staging);
    if (kind === "whitespace-member") {
      put(join(staging, " "), "top-level whitespace member\n");
      members = [prefix, " "];
    } else if (kind === "space-suffixed-engine") {
      put(join(staging, prefix, "packages/coding-agent/package.json "), "{}\n");
      members = [`${prefix}/package.json`, `${prefix}/packages/coding-agent/package.json `];
    }
    command("tar", ["-czf", archive, "-C", staging, ...members], dir);
    if (evidence) writeFileSync(join(evidence, `${String(sequence).padStart(3, "0")}-tar-listing.json`), JSON.stringify({ kind, members, rawListing: command("tar", ["-tzf", archive], dir) }, null, 2));
    if (kind === "traversal") {
      // A real tar header path with a parent segment; no extraction is performed here.
      const raw = Bun.gunzipSync(readFileSync(archive));
      const name = Buffer.from(`${prefix}/../outside`); raw.fill(0, 0, 100); raw.set(name, 0); raw.fill(32, 148, 156);
      const sum = raw.subarray(0, 512).reduce((total, byte) => total + byte, 0);
      raw.set(Buffer.from(sum.toString(8).padStart(6, "0") + "\0 "), 148);
      writeFileSync(archive, Bun.gzipSync(raw));
    }
    provenance.archive.sha256 = digest(readFileSync(archive));
  }
  return { inputs, provenance, archive, archiveName, provenanceName, workspace, run, reject, layout };
}

describe("actual release source receiver", () => {
  test("captures a Git product-subtree archive and materializes bytes, modes, symlink and git metadata", () => {
    const f = fixture("capture product subtree"); const result = f.run();
    expect(result.status).toBe(0);
    expect(result.outputs).toEqual({ "source-sha": f.provenance.source.sha, "archive-sha256": f.provenance.archive.sha256 });
    expect(readFileSync(join(f.workspace, "package.json"), "utf8")).toBe('{"name":"fixture-product","version":"0.1.13"}\n');
    expect(readFileSync(join(f.workspace, "packages/coding-agent/package.json"), "utf8")).toBe('{"name":"fixture-engine","version":"0.1.13"}\n');
    expect(lstatSync(join(f.workspace, "bin/openkai")).mode & 0o777).toBe(0o755);
    expect(readlinkSync(join(f.workspace, "cli"))).toBe("bin/openkai");
    expect(readFileSync(join(f.workspace, ".git/owned"), "utf8")).toBe("preserve git\n");
    expect(existsSync(join(f.workspace, "stale.txt"))).toBe(false);
    expect(existsSync(join(f.workspace, "unrelated.txt"))).toBe(false);
    expect(existsSync(join(f.workspace, "products"))).toBe(false);
  });
  test("requires the same captured source SHA and archive digest on later materialization", () => {
    const first = fixture("initial continuity capture"); const captured = first.run(); expect(captured.status).toBe(0);
    const later = fixture("unchanged continuity handoff"); later.inputs.mode = "require";
    later.inputs["expected-source-sha"] = captured.outputs["source-sha"];
    later.inputs["expected-archive-sha256"] = captured.outputs["archive-sha256"];
    expect(later.run().status).toBe(0);
  });
  for (const change of ["sha", "archive"] as const) test(`rejects a self-consistent changed ${change} after initial capture`, () => {
    const first = fixture(`capture before changed ${change}`); const captured = first.run(); expect(captured.status).toBe(0);
    const later = fixture(`changed ${change} handoff`); later.inputs.mode = "require";
    later.inputs["expected-source-sha"] = captured.outputs["source-sha"];
    later.inputs["expected-archive-sha256"] = captured.outputs["archive-sha256"];
    if (change === "sha") later.provenance.source.sha = "b".repeat(40);
    else { const raw = Bun.gunzipSync(readFileSync(later.archive)); writeFileSync(later.archive, Bun.gzipSync(Buffer.concat([raw, Buffer.alloc(512)]))); later.provenance.archive.sha256 = digest(readFileSync(later.archive)); }
    later.reject();
  });
  for (const values of [[], ["a".repeat(40)], ["", "b".repeat(64)], ["bad", "b".repeat(64)], ["a".repeat(40), "bad"]]) test(`requires a complete valid expected pair: ${values.map(v => v.length).join(",") || "empty"}`, () => {
    const f = fixture("invalid required expectations"); delete f.inputs.mode;
    if (values[0] !== undefined) f.inputs["expected-source-sha"] = values[0];
    if (values[1] !== undefined) f.inputs["expected-archive-sha256"] = values[1];
    f.reject();
  });
  test("rejects an unknown mode", () => { const f = fixture("invalid mode"); f.inputs.mode = "unexpected"; f.reject(); });
  for (const version of ["v0.1.13", "0.1.013", "0.2.13", ""]) test(`rejects noncanonical requested version ${JSON.stringify(version)}`, () => fixture("invalid version", version).reject());
  for (const [title, change] of [
    ["legacy repository and tag", (p: Provenance) => { p.source.repository = "Kaidera-AI/openkai-fork"; p.source.tag = "v0.1.13"; }],
    ["wrong repository", (p: Provenance) => { p.source.repository = "other/repo"; }],
    ["old source tag", (p: Provenance) => { p.source.tag = "v0.1.13"; }],
    ["wrong source tag", (p: Provenance) => { p.source.tag = "openkai/v0.1.14"; }],
    ["wrong version", (p: Provenance) => { p.version = "0.1.14"; }],
    ["invalid source SHA", (p: Provenance) => { p.source.sha = "invalid"; }],
    ["wrong archive name", (p: Provenance) => { p.archive.name = "wrong.tar.gz"; }],
    ["wrong archive digest", (p: Provenance) => { p.archive.sha256 = "f".repeat(64); }],
    ["invalid exception", (p: Provenance) => { p.releaseException = { invalid: true }; }],
  ] satisfies Array<[string, (p: Provenance) => void]>) test(`rejects ${title}`, () => { const f = fixture(title); change(f.provenance); f.reject(); });
  test("accepts a text release exception", () => { const f = fixture("text exception"); f.provenance.releaseException = "Explicit fixture exception"; expect(f.run().status).toBe(0); });
  test("rejects malformed JSON provenance", () => fixture("malformed provenance").reject({ rawProvenance: "{" }));
  test("rejects archive tampering", () => { const f = fixture("tampered archive"); writeFileSync(f.archive, "tampered"); f.reject(); });
  for (const asset of ["archive", "provenance"] as const) test(`rejects missing ${asset}`, () => { const f = fixture(`missing ${asset}`); f.reject({ omit: asset === "archive" ? f.archiveName : f.provenanceName }); });
  for (const kind of ["monorepo", "mixed", "missing-engine", "missing-root", "traversal", "whitespace-member", "space-suffixed-engine"] as const) test(`rejects ${kind} archive before extraction`, () => { const f = fixture(`${kind} archive`); f.layout(kind); f.reject(); });
});

test("all actual downstream workflow materializations consume the original verified pair through declared needs", () => {
  const materializations = Object.entries(workflow.jobs).flatMap(([name, job]) => job.steps.filter(step => step.uses === "./.github/actions/materialize-openkai-source").map(step => ({ name, job, step })));
  expect(materializations.map(item => item.name).sort()).toEqual(["native_addons", "release_assets", "release_binary", "release_binary_darwin", "release_npm", "validate"]);
  function trace(expression: string | undefined, jobName: string, output: string, visited = new Set<string>()): string {
    expect(expression).toBeDefined();
    const key = `${jobName}:${expression}`; if (visited.has(key)) throw new Error("cyclic handoff mapping"); visited.add(key);
    const match = expression!.match(/^\$\{\{ (needs|steps)\.([\w-]+)\.outputs\.([\w-]+) \}\}$/);
    if (!match) throw new Error(`unsupported handoff mapping ${expression}`);
    const job = workflow.jobs[jobName]; expect(match[3]).toBe(output);
    if (match[1] === "needs") {
      const needs = typeof job.needs === "string" ? [job.needs] : job.needs ?? []; expect(needs).toContain(match[2]);
      return trace(workflow.jobs[match[2]].outputs?.[output], match[2], output, visited);
    }
    const source = job.steps.find(step => step.id === match[2]);
    expect(source?.uses).toBe("./.github/actions/materialize-openkai-source");
    expect(jobName).toBe("validate"); expect(source?.with?.mode).toBe("capture");
    expect(action.outputs[output].value).toBe(`\${{ steps.materialize.outputs.${output} }}`);
    return `${jobName}:${match[2]}:${output}`;
  }
  for (const { name, step } of materializations) {
    if (name === "validate") { expect(step.with?.mode).toBe("capture"); continue; }
    expect(step.with?.mode ?? action.inputs.mode?.default).toBe("require");
    for (const output of ["source-sha", "archive-sha256"]) expect(trace(step.with?.[`expected-${output}`], name, output)).toBe(`validate:source:${output}`);
  }
});
