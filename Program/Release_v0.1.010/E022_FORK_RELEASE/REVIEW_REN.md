# E022 INC 06 — adversarial review: ren (deep pass)

**Diff reviewed:** `git diff fac84d626d..HEAD` in `~/DevVault/openkai-fork`
(branch `e022/inc-00-04-tui-consolidation`, 75 files). Read-only review; no fork
files touched. Seams attacked per assignment: gate-floor temp exemption, sdk.ts
toolNames scoping, upgrade-trust, theme contract, secrets/procenv redaction.
Known carried issue (upstream-inherited visible-tab CI failure) not re-reported.

---

## Findings

### REN-01 — blocker — the standalone channel stamp is never applied: the witnessed upgrader is dead code in every shipped binary

**Where:** `packages/coding-agent/scripts/compile-binary.ts:41-45` (the define
map) vs `packages/coding-agent/src/openkai/upgrade-trust.ts:29-34`
(`BUILD_CHANNEL`) consumed at `packages/coding-agent/src/commands/upgrade.ts:92`.

**What breaks:** `upgrade-trust.ts`'s header states the channel is stamped by
"`bun build --compile --define OPENKAI_BUILD_CHANNEL`". No build path does this:
`compileCodingAgent()` hardcodes exactly three defines (`PI_COMPILED`,
`PI_TINY_TRANSFORMERS_VERSION`, `PI_DOCS_EMBED`), and both callers
(`scripts/ci-release-build-binaries.ts:142`, `packages/coding-agent/scripts/build-binary.ts:92`)
have no define-injection surface. Repo-wide grep: `OPENKAI_BUILD_CHANNEL`
exists only inside `upgrade-trust.ts`. Therefore `BUILD_CHANNEL === "npm"` in
EVERY artifact, including the standalone release binaries. In
`commands/upgrade.ts::run()`, a standalone install (not brew, not bun-shim)
then hits `channel === "npm"` and prints
`openkai is npm-managed — upgrade with: npm install -g @kaidera/openkai` —
the Inc 04 trust root (Ed25519 manifest, SHA-256 witness, `.previous`
rollback) never executes outside the test suite, and standalone users get
advice that would create a second, divergent npm install. The gate test cannot
see this: `openkai-upgrade-trust.test.ts:99` asserts
`resolveChannel({ buildChannel: BUILD_CHANNEL }) === BUILD_CHANNEL`, a
tautology that passes for either value. (`OPENKAI_RELEASE_KEY` is likewise
never stamped, so `BUILD_RELEASE_KEY` is always undefined — documented as
"until a keypair exists", noted for completeness.)

**Repro (proven on this machine, bun 1.3.14):**

```sh
cat > probe.ts <<'EOF'
declare const OPENKAI_BUILD_CHANNEL: string | undefined;
const BUILD_CHANNEL =
  typeof OPENKAI_BUILD_CHANNEL !== "undefined" && OPENKAI_BUILD_CHANNEL === "standalone" ? "standalone" : "npm";
console.log("BUILD_CHANNEL=" + BUILD_CHANNEL);
EOF
bun build --compile --minify ./probe.ts --outfile probe && ./probe
# -> BUILD_CHANNEL=npm
```

**Suggested fix:** add `"OPENKAI_BUILD_CHANNEL": JSON.stringify("standalone")`
(and `OPENKAI_RELEASE_KEY` once the keypair exists) to the `define` map in
`compile-binary.ts`, and add a release-CI smoke that runs the compiled
binary's `openkai upgrade --check` and asserts it does NOT print the npm
deferral (the current suite's tautological assertion would have caught this
had it compared against the expected literal `"standalone"`).

**Confidence:** 0.95 (code read + compiled-binary probe; no define path exists anywhere).

---

### REN-02 — major — `openkai upgrade` swaps `process.execPath` with no compiled-binary guard; the env channel override can clobber the node/bun runtime itself

**Where:** `packages/coding-agent/src/commands/upgrade.ts:104`
(`currentBinary: process.execPath`) -> `upgrade-trust.ts:323`
(`rename(this.staging, this.opts.currentBinary)`).

**What breaks:** nothing verifies that `currentBinary` is an OpenKai compiled
binary before the witnessed swap renames the downloaded artifact over it.
`OPENKAI_CHANNEL` is an exported, documented "operator/test override" — and,
given REN-01, it is currently the ONLY way to reach the upgrader at all. On an
npm install launched via plain node, `process.execPath` is the node executable
itself (e.g. `/opt/homebrew/bin/node`, user-writable under brew); the
brew/bun path classifiers don't match it, so the forced standalone path
downloads the artifact and renames it over `node`. Every subsequent `node`
invocation for that user launches the OpenKai binary. Same shape for a
node-shebanged bun-global shim outside `~/.bun`. The build already stamps the
discriminating fact: `compile-binary.ts:42` sets
`process.env.PI_COMPILED = "true"` in compiled binaries only.

**Repro:** `npm i -g @kaidera/openkai` (node shim), then
`OPENKAI_CHANNEL=standalone openkai upgrade` -> `Upgrader` is constructed with
`currentBinary` = the node executable -> `rename(<staging>, <node path>)`.

**Suggested fix:** fail closed in `commands/upgrade.ts::run()` before
constructing the upgrader: refuse unless `Bun.env.PI_COMPILED === "true"`
(or `process.execPath` basename matches the installed binary name) — one line,
uses a stamp the build already applies.

**Confidence:** 0.8 (mechanism proven by code path; requires the operator env
override to fire — but that override is the only live route to the feature).

---

### REN-03 — major — `detectTarget()` cannot tell musl from glibc: a musl standalone install upgrades onto a glibc binary that will not start

**Where:** `packages/coding-agent/src/openkai/upgrade-trust.ts:78-81`
(`detectTarget`) vs the release matrix
`scripts/ci-release-build-binaries.ts:55-67` (`linux-musl-x64`,
`linux-musl-arm64` artifacts).

**What breaks:** `detectTarget()` is `${process.platform}-${arch}` — a musl
(alpine/void-musl) install resolves target `linux-x64`, so
`Upgrader.findArtifact()` matches the GLIBC artifact in the manifest and the
witnessed swap installs it. The new binary fails at exec (loader mismatch:
`/lib64/ld-linux-x86-64.so.2` absent); the operator must discover the breakage
and run `openkai upgrade --rollback` some other way — the freshly installed
binary won't run. The release pipeline ships musl artifacts, so this channel
is real, and the manifest will presumably carry `linux-musl-*` target ids that
no client can ever request.

**Repro:** on alpine, standalone install, `openkai upgrade` -> `target:
"linux-x64"` -> glibc binary swapped in -> next launch: loader error.

**Suggested fix:** detect musl in `detectTarget()` — e.g.
`process.report?.getReport()?.header?.glibcVersionRuntime` absent on linux =>
musl (or probe `/usr/bin/ldd`) — and emit `linux-musl-${arch}`.

**Confidence:** 0.85 (mechanism certain; manifest target-id vocabulary not yet
published, but the matrix names the musl outfiles exactly so).

---

### REN-04 — major — the temp-scratch exemption trusts `os.tmpdir()` blindly; a broad `TMPDIR` silently disables deny-by-containment for the whole session

**Where:** `packages/coding-agent/src/openkai/gate-floor.ts:142-152`
(`outsideCwd`) + `:155-163` (`tmpdirCanonical`).

**What breaks:** the E022 containment exemption treats the realpath of
`os.tmpdir()` as unconditional scratch. `os.tmpdir()` is env-controlled
(`TMPDIR`/`TMP`/`TEMP`). Wrappers and CI not infrequently export a broad
`TMPDIR` (`$PWD`, a workspace root, `$HOME`). When that happens, EVERY path
under it passes containment — the outside-cwd half of the deny floor silently
evaporates for the session and only the DENY_FLOOR name patterns remain. The
failure is silent: no log, no warning, the floor's block reason simply never
fires.

**Repro (proven on this machine):**

```sh
TMPDIR=/Users/amadmalik bun probe.ts   # probe calls outsideCwd(realCwd, "~/Documents/secret-plans.md")
# -> false  (containment disabled; with default TMPDIR -> true)
```

**Suggested fix:** bound the exemption: refuse the temp exemption when the
resolved tmpdir equals or is an ancestor of `$HOME` or of the session cwd (or
only honour the platform-default temp root, i.e. ignore `TMPDIR` overrides for
this security decision). Any of these is a few lines in `outsideCwd`.

**Confidence:** 0.7 (impact proven; exploitability depends on environment, but
the failure mode is silent and absolute when it bites).

---

### REN-05 — minor — `compareVersions` ranks prerelease tags above the release: a prerelease in `latest.json` downgrades stable installs

**Where:** `packages/coding-agent/src/openkai/upgrade-trust.ts:84-99`.

**What breaks:** segment comparison falls back to lexicographic ordering when
either side is non-numeric: `"0.1.10"` vs `"0.1.10-rc.1"` -> segment 2 is
`"10"` vs `"10-rc"` -> not both finite -> `"10" < "10-rc"` -> manifest judged
newer -> `updateAvailable === true` -> a stable 0.1.10 install performs a
witnessed DOWNGRADE to the prerelease. Semver says prerelease < release. Bites
only if the release pipeline ever publishes an rc/beta to `latest.json`.

**Repro:** `compareVersions("0.1.10-rc.1", "0.1.10")` returns `1` (rc "newer").

**Suggested fix:** split prerelease at `-` before comparing; a version with a
prerelease component sorts BELOW the same version without one.

**Confidence:** 0.75 (logic verified by reading; no mixed-tag manifest exists
yet — pipeline hygiene is the only current guard).

---

### REN-06 — minor — the explicit theme contract is case-sensitive: `--theme Dark` / `OPENKAI_THEME=AUTO` pin a nonexistent theme and silently land on the fallback

**Where:** `packages/coding-agent/src/modes/theme/theme.ts:88-95`
(`parseExplicitThemeValue`).

**What breaks:** contract vocabulary (`dark`/`light`/`auto`) is matched
case-sensitively. `--theme Dark` or `OPENKAI_THEME=AUTO` (plausible from
shell/env conventions) parses as a theme-NAME pin; the pin fails to load ->
silent fallback to `dark` — and because a pin is set, `reevaluateAutoTheme`
returns early forever, so appearance detection is suppressed for the session.
The user asked for auto/light, got pinned dark with no message. Env-var-sourced
values are the realistic trigger (the theme contract is a KOS spawn
deliverable; KOS will pass env).

**Repro:** `OPENKAI_THEME=AUTO openkai` -> `getExplicitThemeContract()` reports
`{ pin: "AUTO", source: "env" }`; theme resolves to the dark fallback, never
to detection.

**Suggested fix:** case-fold (`trimmed.toLowerCase()`) before matching the
reserved words; keep the pinned-name branch case-preserved for theme lookup
(theme names are lowercase by convention, so folding the whole value is also
acceptable).

**Confidence:** 0.9.

---

## Seams examined and cleared (evidence, no finding)

- **DENY_FLOOR inside temp (assignment Q1).** Exercised the real functions
  under bun: `.env`, `*.pem`, `.ssh`, `.aws/credentials`, `.git/config`,
  nested `id_ed25519` under `$TMPDIR` all match (basename fallback +
  `**/`-anywhere regex survive the `../..` relative-path form); a symlink
  under temp pointing at `$HOME` resolves BEFORE the temp check and is denied
  both ways; real-tree escapes (`/etc/passwd`, `../escape.txt`) still denied;
  clean temp scratch passes. The unconditional exemption opens no DENY_FLOOR
  target. (The residual exposure — OTHER applications' non-pattern files in
  shared temp — is the documented, deliberate trade-off in INC_03_04_GATE §1.)
- **sdk.ts toolNames scoping (assignment Q2).** The `fusion`-keyed gate only
  keeps the openkai tools out of the REGISTRY for explicitly scoped sets;
  upstream's real restriction mechanism (`restrictToolNames`) empties
  `alwaysInclude` and the requested-intersect-registry filter then yields
  exactly the named tools — no rlm/cortex leak into a restricted session, and
  fusion stays default-on when `toolNames` is undefined. A restricted set
  naming `rlm_spawn` without `fusion` silently gets nothing — coarse but
  documented inline (CI-driven, intentional).
- **brew/bun classification (assignment Q3).** Proved on-device that a
  bun-compiled binary launched through a symlink reports the RESOLVED path in
  `process.execPath` (`/private/tmp/.../Cellar/...`), so `isBrewManaged`'s
  `/Cellar/` match holds on macOS brew; linuxbrew/homebrew covered likewise.
  Rollback never fetches and is kill-switch-exempt by design (recovery path).
- **Theme precedence + auto-path races (assignment Q4).** `--theme` beats
  `OPENKAI_THEME` (flag source blocks env resolution, including `--theme auto`
  suppressing env); lock checked before OSC 11 `terminalReportedAppearance`
  in `detectTerminalBackground`; pin/lock win over async appearance events in
  `reevaluateAutoTheme`; pinned unknown names fail to the dark fallback; the
  composer-cache v2 bump kills the pre-cutover titanium flash.
  `applyFlagThemeOverride` is only wired into `runRootCommand` (launch/acp/
  join) — subcommands ignore `--theme` but still honour the env contract;
  contract is spawn-scoped, so noted, not flagged.
- **secrets.ts / procenv.ts (assignment Q5).** The E022 diff to both files is
  formatting-only (`git diff -w` is empty apart from one line-join). The scrub
  is applied at the one model-authored spawn seam (fusion gate,
  `fusion/gate.ts:142`); redaction fires at the fusion-telemetry and
  shift-activity sinks as the equivalence suite pins.

## Pre-existing (NOT introduced by this diff — for the lead's disposition, not release-gating E022)

- `cortex-memory.ts:110` — `cortex_record` posts model-authored learning text
  to the shared project memory with NO `redactSecrets` pass (fusion telemetry
  redacts; this path never did). A model that quotes a key in a "learning"
  persists it to every agent on the project. E021-era; unchanged by E022.
- `floor-extension.ts:14` — the floor inspects only path-shaped args
  (`path|file|filePath|target|targetPath|outputPath`); the `bash` tool's
  `command` string is never scanned, so `bash: cat ~/.ssh/id_rsa` bypasses the
  floor. E021-era design; unchanged by E022.

---

**Verdict:** NOT SHIP-READY on the standalone channel — REN-01 makes the Inc 04 witnessed-upgrade feature unreachable in shipped binaries (blocker); REN-02/03/04 want fixes or written dispositions before the four-channel cut.
