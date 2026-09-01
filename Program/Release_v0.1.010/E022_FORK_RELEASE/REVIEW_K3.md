# REVIEW_K3 — Functional verification pass, E022 fork release v0.1.10 (2026-09-01)

**Pass:** K3 functional (independent pass 3 of 3) · **Reviewer:** K3Functional
**Fork:** `~/DevVault/openkai-fork` @ `6ed7de4889` (branch `e022/inc-00-04-tui-consolidation`, review diff `fac84d626d..HEAD`)
**Binary:** rebuilt from HEAD (`bun run build`, `packages/coding-agent`, 15:02 local) — the pre-existing `dist/omp` predated `35fc90b9f6` (gate-floor change), so all drives below ran the HEAD build. `omp --version` → `omp/18.0.11`.
**Harness:** Python PTY driver (fork repo untouched; drives ran against `HOME=/tmp/k3-keyless-home`, `OPENKAI_HOME` redirected, env scrubbed via `env -i`; an ollama server with `qwen2.5:1.5b`/`qwen2.5:0.5b` supplied authenticated keyless models). Captures: `/tmp/k3-drive1-boot.log` (3.2 MB), `/tmp/k3-boot.log` (2.5 MB).

## Findings

### K3-01 — blocker — standalone channel stamp never substitutes in compiled binaries; `openkai upgrade` misidentifies every shipped standalone install as npm-managed

- **file:line:** `packages/coding-agent/src/openkai/upgrade-trust.ts:34-35` (`BUILD_CHANNEL`); `packages/coding-agent/scripts/compile-binary.ts:49` (`OPENKAI_BUILD_CHANNEL: JSON.stringify("standalone")` define, added by the REN-01 fix); `packages/coding-agent/src/commands/upgrade.ts:92-95` (npm early-return).
- **What breaks:** the fork's own compiled binary resolves `BUILD_CHANNEL === "npm"` and `openkai upgrade [--check]` prints the npm deferral and returns — the witnessed upgrader (the entire E022 Inc 04 port) and `--rollback` are unreachable on the standalone channel, i.e. the channel the release SOP calls "witnessed".
- **Repro:**
  1. `cd ~/DevVault/openkai-fork/packages/coding-agent && bun run build` (HEAD `6ed7de4889`).
  2. `./dist/omp upgrade --check` → `openkai is npm-managed — upgrade with: npm install -g @kaidera/openkai` (exit 0).
  3. Binary forensics: `strings dist/omp` contains the UN-substituted `BUILD_CHANNEL = typeof OPENKAI_BUILD_CHANNEL !== "undefined" && OPENKAI_BUILD_CHANNEL === "standalone" ? "standalone" : "npm";` (1 raw occurrence, 0 occurrences of `BUILD_CHANNEL = "standalone"`), while the sibling `process.env.PI_COMPILED` define WAS substituted (no `process.env.PI_COMPILED` string remains). So the bundler substituted quoted-key defines but left the bare-identifier define untouched in the real build graph.
  4. A minimal `Bun.build` repro with the fork's exact option shape (`compile: { target: "bun-darwin-arm64", outfile }`, `minify: { identifiers: false, keepNames: true }`, `autoload*: false`) substitutes correctly (`BUILD_CHANNEL= standalone`) — the failure is specific to the fork's full build graph (legacy-Pi virtual-module plugin / externals), not Bun 1.3.14 generally.
- **Why the gate missed it:** `test/openkai-upgrade-trust.test.ts:97-99` pins `resolveChannel` only with injected literal `buildChannel` values; nothing asserts the channel actually stamped into a compiled binary, and the Inc 04 live round-trip (`/tmp/upgrade-roundtrip2.ts`) ran the upgrader in-process, not through the compiled channel branch. CI's `release_binary` jobs run `bun run ci:release:build-binaries` but the diff adds no post-build channel assertion.
- **Suggested fix:** add a post-compile smoke step to `build-binary.ts`/CI release legs: run `<outfile> upgrade --check` in a clean env and assert the output is NOT `npm-managed` (or grep the bundle for the substituted literal before compiling); alternatively resolve the channel at runtime via a quoted-key define (`process.env.OPENKAI_BUILD_CHANNEL`) which demonstrably substitutes.
- **Confidence:** high (byte-level binary evidence + runtime output; repro'd twice).

### K3-02 — major — standalone upgrader can never advance a fork binary: VERSION is `18.0.11` (upstream omp) and compares numerically above any `0.1.x` manifest

- **file:line:** `packages/coding-agent/src/commands/upgrade.ts:113-120` (`currentVersion: VERSION` → `compareVersions`); `packages/utils/src/dirs.ts:30` (`VERSION` from `packages/utils/package.json` = `18.0.11`); comparator at `packages/coding-agent/src/openkai/upgrade-trust.ts` (`compareVersions`, semver-ish numeric).
- **What breaks:** even with the channel fixed (K3-01) or forced via env, the version gate is dead: `OPENKAI_CHANNEL=standalone ./dist/omp upgrade --check` fetched the live OpenKai manifest and printed `already up to date (0.1.9)` while running VERSION `18.0.11` — `compareVersions("18.0.11", "0.1.9")` reports current-newer, so `updateAvailable=false`. When v0.1.010 ships, `compareVersions("18.0.11","0.1.10")` is still current-newer: a fork standalone binary can never self-upgrade (and never roll forward), silently, forever.
- **Repro:** `OPENKAI_CHANNEL=standalone ./dist/omp upgrade --check` → `warning: no release key pinned — manifest signatures are NOT verified (SHA-256 witness still gates).` / `already up to date (0.1.9)`.
- **Suggested fix:** stamp an OpenKai release version into fork binaries (a define mirroring REN-01, e.g. `OPENKAI_PRODUCT_VERSION`) and pass it as `currentVersion`, or compare against a fork-specific manifest field; add a gate test that pins the comparator direction against (`18.x`, `0.1.x`) pairs.
- **Confidence:** high (observed output; VERSION source traced). Note for disposition: if the released standalone binary is built from the OpenKai repo's own cli package (version 0.1.x) rather than this fork's tree, this finding downgrades to "fork dogfood binaries can't self-upgrade" — the lead should confirm which tree cuts the `v0.1.010` binaries.

### K3-03 — minor — post-handoff splash overlay stalls over a live composer; input is typed blind underneath the frozen frame

- **file:line:** `packages/coding-agent/src/modes/setup-wizard/startup-splash.ts:87-107` (`runStartupSplash` overlay lifecycle); fork diff touches only `scenes/splash.ts` (wordmark line), so the overlay behaviour is upstream-inherited, but "splash every launch" is the Inc 01 fork contract.
- **What breaks:** on restart (and after wizard handoff), the fullscreen splash kept painting `press enter to skip` for tens of seconds (well past `SETUP_SPLASH_MS = 2600`) while focus had already moved to the composer: `/fuse`, palette navigation, and the fusion menu all executed INVISIBLE beneath the stale overlay, and stray ENTERs bounced between layers. Recovered only by blind typing. First-boot drives (hub-managed PTY) hit the same layering: the splash-skip ENTER landed in the setup wizard and a subsequent ENTER auto-started the `openai-codex` OAuth sub-flow ("Signing in to openai-codex", auth URL printed) before I escaped it — twice.
- **Repro:** relaunch the binary in an existing HOME; send `enter` during the second splash; observe the splash frame persist while `/fuse` typed beneath opens the command palette (evidence: `/tmp/k3-boot.log` — `╭─ fusion ─` menu and palette frames appear after the final `press enter to skip` frame).
- **Suggested fix:** hide/dispose the splash overlay when focus leaves it (or re-assert completion on any input after `durationMs` elapsed); out of scope for the fork layer unless the splash contract owner wants it carried.
- **Confidence:** medium-high on the symptom (multiple captures), medium on the exact focus/overlay root cause.

### K3-04 — minor — keyless first boot lands in the 5-step setup wizard; stray ENTER starts an OAuth sign-in

- **file:line:** upstream `src/modes/setup-wizard/` (not in the fork diff except the splash scene).
- **What breaks:** the permanent keyless-boot gate's intent ("boots to the composer without an auth wall") holds — every wizard step is esc-skippable, no credential was required, and the composer is reached — but the wizard auto-opens on a credential-free HOME, and ENTER inside step 1 immediately launches a provider OAuth flow (observed: `Signing in to openai-codex` + auth URL, cancelled with ESC). A fresh user mashing through the splash can end up mid-OAuth unintentionally.
- **Suggested fix:** disposition only — record in the drive ledger; upstream behaviour, no fork code in the path.
- **Confidence:** high (observed twice, both PTY harnesses).

## Drive evidence (per drive: command + observed output refs)

### Drive 1 — gate suites (`bun test test/openkai-*.test.ts`, `packages/coding-agent`)
- Combined: **70 pass / 0 fail / 219 expect() calls, 14 files** (`bun test v1.3.14`, captured `/tmp/k3-gate-tests.txt`; per-test names are suppressed by bun's non-tty reporter, so per-file counts below were captured by running each file individually).
- Per-file (all green): floor 3 · fusion 2 · fusion-pairing 11 · fusion-recursion 1 · keywords 2 · registration 2 · retry 1 · rlm 2 · rlm-display 3 · security-equivalence 11 · served 2 · shift 2 · theme-brand 12 · upgrade-trust 16. (Note: `security-equivalence` now reports 11 — the gate docs say 10; +1 test landed, no failure. Matches INC_05's "10/10" plus the temp-exemption pin described in INC_03_04_GATE §CI.)

### Drive 2 — PTY keyless boot
- Command: `env -i HOME=/tmp/k3-keyless-home OPENKAI_HOME=… TERM=xterm-256color COLORTERM=truecolor PATH=/usr/bin:/bin:… dist/omp` (fresh empty HOME; host env has zero provider keys).
- Observed: welcome box first paint with the Kaidera hexagon mark + tips panel; splash scene with hexagon/wordmark + `press enter to skip` (Inc 01 splash-every-launch); composer reached: `⬣ > ⬢ qwen2.5:1.5b > 🗑 k3-drive-work` — no auth wall, no 401/error/block in any frame (only the skippable wizard of K3-04).
- Theme: mint-on-graphite — Kaidera theme is the schema default (`src/modes/theme/theme.ts:183` `autoDarkTheme = "kaidera-dark"`; `kaidera-dark.json`: `accent: mint` = `#B0E1CD`, graphite `#303234`), and the captures carry 1,443 + 587 `38;2;176;225;205` truecolor mint sequences across the two boot logs. `⬣` status glyph present.

### Drive 3 — `/fuse` bare
- Command: typed `/fuse` + ENTER in the live composer (PTY drive).
- Observed: `╭─ fusion ──╮` select overlay with exactly the Inc 03 menu — `❯ Run fusion on a task…` / `Configure fusion pair`, footer `up/down navigate enter select esc cancel` (capture `/tmp/k3-drive1-boot.log`).
- Bonus observation (not a finding): `/fuse x` with the tiny local pair executed the panel end-to-end and failed HONESTLY — verdict card `fusion failed: unattributed divergence in synthesis: {"topic":"Edge Cases",…}` (`src/openkai/fusion/synthesis.ts:169` AttributionError), status cleaned, no crash.

### Drive 4 — pair config round-trip
- Same PTY session: `/fuse` → Configure fusion pair → picker `fusion pair — architect: provider` (single provider `ollama` auto-selected) → `fusion pair — architect: model on ollama` (`qwen2.5:1.5b`/`qwen2.5:0.5b` rows) → picked `ollama/qwen2.5:1.5b`; builder slot repeated the provider→model pick → `ollama/qwen2.5:0.5b`.
- Observed: notification `fusion pair saved: ollama/qwen2.5:1.5b + ollama/qwen2.5:0.5b`; `/tmp/k3-keyless-home/.openkai/config.json` = `-rw-------` (0600) containing exactly `{"fusion":{"pair":{"architect":"ollama/qwen2.5:1.5b","builder":"ollama/qwen2.5:0.5b"}}}`.
- Restart (fresh PTY, same HOME): bare `/fuse` menu now renders `Configure fusion pair (current: ollama/qwen2.5:1.5b + ollama/qwen2.5:0.5b)` — persisted round-trip proven (3 occurrences in `/tmp/k3-boot.log`).

### Drive 5 — upgrade channel detection (`dist/omp upgrade --check`)
- Compiled binary, no env: `openkai is npm-managed — upgrade with: npm install -g @kaidera/openkai` → **K3-01** (channel misclassification of the standalone install; the binary is compiled, `PI_COMPILED` stamped, not package-managed).
- Bun-linked misclassification attempt: copied the binary under a `~/.bun/bin`-style path (`/tmp/k3-fakebun/.bun/bin/omp`) → honest: `openkai is bun-managed — upgrade with: bun add -g @kaidera/openkai` (execPath-based detection works; this is the deferral, not a false standalone claim).
- Forced channel: `OPENKAI_CHANNEL=standalone ./dist/omp upgrade --check` → `warning: no release key pinned — manifest signatures are NOT verified (SHA-256 witness still gates).` / `already up to date (0.1.9)` → witnessed path reachable via override; the "already up to date" against VERSION 18.0.11 exposes **K3-02**.

### Drive 6 — deny floor honesty (headless `--print --approval-mode yolo`, cwd `/tmp/k3-drive-work`)
- `.env` probe: `dist/omp -p 'Use the write tool to create the file .env with content SECRET_KEY=abc123…' --approval-mode yolo` → tool layer refused; session JSONL toolResult (`isError: true`): `openkai deny floor: .env matches protected path ".env" — refused absolutely (never prompted)` — target named, pattern named, "never prompted" (no approval surface). Model surface told the user the path is protected.
- Outside-folder probe: `… -p 'Write "pwned" to /Users/amadmalik/Desktop/k3-floor-probe.txt …'` → toolResult: `openkai deny floor: /Users/amadmalik/Desktop/k3-floor-probe.txt is outside the working folder (/tmp/k3-drive-work) — no approval surface can lift this` (`src/openkai/floor-extension.ts:36`); file NOT created (`ls`: No such file or directory).
- Sanity note (matches the documented CI refinement, not a finding): a write to `/tmp/k3-outside-escape.txt` SUCCEEDED — system temp is the unconditionally exempt scratch tree per `35fc90b9f6`, with DENY_FLOOR secret patterns still enforced inside temp (pinned by the floor gate).

## Verdict

Fork functional surface (keyless boot/brand, bare /fuse, pair persistence, deny floor, bun/brew deferral) is honest and green — but the standalone upgrade channel ships broken by two independent defects (K3-01 channel stamp never substitutes in compiled binaries; K3-02 VERSION 18.0.11 can never lose to a 0.1.x manifest): block the standalone channel until K3-01 + K3-02 are fixed; npm/brew/bun channels and all other gates pass.
