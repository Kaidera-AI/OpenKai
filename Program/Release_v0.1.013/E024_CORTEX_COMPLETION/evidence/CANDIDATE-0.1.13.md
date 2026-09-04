# OpenKai 0.1.13 local candidate validation — 2026-09-04

## Candidate identity

- Source repository: `/Users/amadmalik/DevVault/openkai-fork-e024-retire-local`
- Branch: `e024/w3-retire-local`
- Exact candidate: `db7f921658c57e943a763a06bf25312d9ac5eef4`
- Reviewed implementation commit: `8aef97f7f4ad2753b0e81627139dec6572270bd2`
- Public installer automation commit: `a8674ed27e855dc59f3b15277be1ea6989acd4cf`
- Ren exact-candidate verdict: **GO — no findings**

The source worktree was clean after the candidate commit and again after build and release dry-runs.

## Version contract

All inspected candidate values were exactly `0.1.13`:

- coding-agent engine package;
- npm wrapper package;
- wrapper dependency on `@kaidera/openkai-engine`;
- `PRODUCT_VERSION`;
- coding-agent workspace entry in `bun.lock`;
- dated changelog heading.

The compiled binary reported:

```text
openkai/0.1.13
```

## Static, test, and binary checks

```text
bun run check
check: passed

bun test <22 changed-contract files plus security and release-contract suites>
559 pass
0 fail
2016 expect() calls
25 files

bun run --cwd packages/coding-agent build
Build complete

./packages/coding-agent/dist/openkai --smoke-test
smoke-test: ok

./packages/coding-agent/dist/openkai --version
openkai/0.1.13
```

The first combined security/release run exposed a full-suite-isolation defect in the security-equivalence test: that test replaced the entire process environment in `finally`, removing unrelated suites' temporary directory variables. Candidate commit `db7f921658` changed it to restore only the three keys the test mutates. The focused three-file concurrency run then passed 164/0, and the complete 25-file run above passed 559/0. No product behavior was suppressed or special-cased.

## Non-mutating release rehearsals

`ci-release-build-binaries.ts --dry-run` covered seven targets: Darwin arm64/x64, Linux glibc arm64/x64, Linux musl arm64/x64, and Windows x64. `ci-release-publish.ts --dry-run --scope kaidera` reached the engine then wrapper pack/publish plan. Neither command built release assets, uploaded anything, or published a package.

The public installer helper was run only against a byte-identical temporary copy. Updating that copy to `v0.1.13` and verifying it both succeeded. The public repository remained clean at `a8674ed27e855dc59f3b15277be1ea6989acd4cf`, and public `scripts/install.sh` remained pinned to `v0.1.009`.

## Release boundary

This is a local release candidate, not a release. No tag, push, npm publication, GitHub release/asset upload, Homebrew or `latest.json` change, public installer repoint, or local installed-binary cutover occurred. Exact-version CTO consent was not given in this session.
