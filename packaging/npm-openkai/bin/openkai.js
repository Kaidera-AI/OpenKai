#!/usr/bin/env bun
/**
 * @kaidera/openkai bin shim (E022 Inc 06, CTO decision 6): the wrapper package
 * for the fork line's npm/bun channel. The product lives in
 * @kaidera/openkai-engine (the fork's coding-agent — omp engine + openkai layer, pinned
 * 18.0.11); this shim is the `openkai` command name on top of it. The runtime
 * is bun (the fork's npm channel is a bun-runtime channel — E020 verdict).
 *
 * The published package maps "./*.js" onto its TS source (the source-install
 * idiom — bun executes it). cli.ts only auto-runs when it is the process
 * entry, so the shim invokes runCli explicitly.
 */
import { runCli } from "@kaidera/openkai-engine/cli.js";

await runCli(process.argv.slice(2));
