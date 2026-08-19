#!/usr/bin/env node
/**
 * sign-manifest — sign a release manifest with the OpenKai release key
 * (E017 inc 09). Runs at release time, never on end-user machines.
 *
 * Usage:
 *   OPENKAI_RELEASE_PRIVATE_KEY="$(cat path/to/key.pem)" \
 *     node packages/cli/scripts/sign-manifest.mjs path/to/latest.json
 *
 * Reads the manifest JSON, computes the Ed25519 signature over the canonical
 * bytes (upgrade.ts canonicalManifestBytes — version + sorted artifacts), and
 * writes the `signature` field back into the file. Pinned builds (see
 * build-binaries.sh) refuse unsigned or invalid manifests, so a release
 * without this step ships binaries that cannot self-upgrade.
 *
 * The private key comes from the OPENKAI_RELEASE_PRIVATE_KEY env var (PKCS8
 * PEM). Custody: CTO / CI secret — never the repo.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist/upgrade.js");
const { signManifest } = await import(dist);

const manifestPath = process.argv[2];
if (!manifestPath) {
  process.stderr.write("usage: sign-manifest.mjs <path/to/latest.json>\n");
  process.exit(2);
}
const pem = process.env.OPENKAI_RELEASE_PRIVATE_KEY;
if (!pem) {
  process.stderr.write("error: OPENKAI_RELEASE_PRIVATE_KEY (PKCS8 PEM) is required\n");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
if (typeof manifest.version !== "string" || !Array.isArray(manifest.artifacts)) {
  process.stderr.write("error: manifest must carry {version, artifacts[]}\n");
  process.exit(2);
}

// Sign the canonical bytes (the signature field itself is excluded by the
// canonical form — sign then attach).
delete manifest.signature;
manifest.signature = signManifest(manifest, pem);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
process.stdout.write(`signed ${manifestPath} (version ${manifest.version}, ${manifest.artifacts.length} artifact(s))\n`);
