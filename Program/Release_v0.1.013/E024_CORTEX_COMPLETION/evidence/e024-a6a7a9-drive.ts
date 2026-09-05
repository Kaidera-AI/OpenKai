// E024 A6/A7/A9 exact-candidate scratch drive — 2026-09-05 (kai)
// Candidate db7f921658c57e943a763a06bf25312d9ac5eef4. Scratch :8601 mutations only;
// production :8501 strictly read-only. Admin token process-only, never printed.
const SRC = "/Users/amadmalik/DevVault/openkai-fork-e024-retire-local/packages/coding-agent/src";
const ENV_FILE = "/Users/amadmalik/Library/Application Support/Kaidera OS/cortex-test/cortex-test.env";
const SCRATCH = "http://127.0.0.1:8601";
const PROD = "http://localhost:8501";
const PROD_PROJECT = "openkai";
const ACCEPT = "openkai-acceptance";

for (const k of ["CORTEX_API_URL", "CORTEX_PROJECT", "CORTEX_ADMIN_TOKEN", "CORTEX_API_TOKEN", "CORTEX_TOKEN", "OPENKAI_AGENT", "HINDSIGHT_API_URL", "HINDSIGHT_API_TOKEN", "HINDSIGHT_BANK_ID"]) delete process.env[k];

const { Settings } = await import(`${SRC}/config/settings.ts`);
const { CortexClient } = await import(`${SRC}/openkai/cortex/client.ts`);
const { cortexWriterClientFor, cortexClientFor } = await import(`${SRC}/openkai/cortex/settings.ts`);
const { CortexIngestController } = await import(`${SRC}/cortex-ingest/controller.ts`);

const runId = crypto.randomUUID();
const out: string[] = [];
const log = (s: string) => { out.push(s); console.log(s); };

// ── admin token, process-only ────────────────────────────────────────────────
const envText = await Bun.file(ENV_FILE).text();
const adminToken = envText.split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith("KOS_CORTEX_ADMIN_TOKEN="))?.split("=").slice(1).join("=").replace(/^["']|["']$/g, "");
if (!adminToken || adminToken.length < 8) { log("ABORT: scratch admin token unreadable"); process.exit(2); }
log(`admin token: loaded process-only (length ${adminToken.length}); value never printed`);
const adminHeaders = { "Content-Type": "application/json", "X-Cortex-Admin-Token": adminToken };

// ── outbound body capture (A9) ───────────────────────────────────────────────
const capturedBodies: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const body = typeof init?.body === "string" ? init.body : undefined;
  if (body) capturedBodies.push(body);
  return realFetch(input, init);
}) as typeof fetch;

// ── phase 0: preflight ───────────────────────────────────────────────────────
const prodBefore = {
  health: await (await realFetch(`${PROD}/health`)).json(),
  project: await (await realFetch(`${PROD}/projects/${PROD_PROJECT}`)).json(),
  roster: null,
};
const scratchProjects = await (await realFetch(`${SCRATCH}/projects`)).json();
log(`preflight: scratch projects=${JSON.stringify(scratchProjects)} (must be [])`);
if (Array.isArray(scratchProjects) && scratchProjects.length !== 0) { log("ABORT: scratch not empty"); process.exit(2); }
log(`preflight: production ${PROD_PROJECT} status=${prodBefore.project?.status} default_agent=${prodBefore.project?.default_agent}`);

// ── phase 1: register acceptance project on scratch ─────────────────────────
const reg = await realFetch(`${SCRATCH}/projects`, {
  method: "POST", headers: { ...adminHeaders, "X-Cortex-Project-Mode": "create-only" },
  body: JSON.stringify({ project_key: ACCEPT, display_name: "OpenKai acceptance", roots: [{ path: "/projects/openkai-acceptance", kind: "primary" }], agents: [{ name: "probe", role: "probe" }], default_agent: "probe" }),
});
log(`register: POST /projects -> ${reg.status}`);
if (reg.status >= 300) { log(`ABORT: registration failed: ${await reg.text()}`); process.exit(2); }
const proj = await (await realFetch(`${SCRATCH}/projects/${ACCEPT}`)).json();
log(`register: GET project -> status=${proj.status} default_agent=${proj.default_agent}`);

// ── phase 2: A6 settings-driven record/search ────────────────────────────────
const settings = Settings.isolated({ "memory.backend": "cortex", "cortex.apiUrl": SCRATCH, "cortex.project": ACCEPT, "cortexingest.enabled": false, "cortexingest.transcripts": false });
const writer = await cortexWriterClientFor(settings);
if (!writer) { log("ABORT: no settings-driven writer"); process.exit(2); }
const marker = `A6-${runId}`;
await writer.recordMemory({ section: "learnings", content: `e024 acceptance marker ${marker}`, source: `openkai/e024-a6/${runId}` });
const hits = await writer.search(marker, 10);
log(`A6: marker=${marker} scratch-hits=${hits.length} ids=${hits.map(h => h.id.slice(0, 8)).join(",")}`);
const prodClient = new CortexClient({ baseUrl: PROD, project: PROD_PROJECT });
const prodHits = await prodClient.search(marker, 10);
log(`A6: production hits for marker=${prodHits.length} (must be 0)`);

// ── phase 3: A9 redaction ────────────────────────────────────────────────────
const fake = `sk-e024fake${runId.replace(/-/g, "")}`;
await writer.recordMemory({ section: "learnings", content: `note with credential ${fake} embedded`, source: `openkai/e024-a9/${runId}/${fake}` });
const a9hits = await writer.search("credential", 20);
const stored = a9hits.map(h => h.text).join("\n");
log(`A9: stored-rows=${a9hits.length} literal-fake-in-stored=${stored.includes(fake)} (must be false)`);
const fakeInBodies = capturedBodies.some(b => b.includes(fake));
log(`A9: captured-outbound-bodies=${capturedBodies.length} literal-fake-in-any-body=${fakeInBodies} (must be false)`);

// ── phase 4: A7 transcript default-off + opt-in ──────────────────────────────
const mkSession = (sessionId: string) => ({
  subscribe: (_cb: any) => () => {},
  messages: [
    { role: "user", content: [{ type: "text", text: `e024 transcript probe ${sessionId} with ${fake} inside` }], timestamp: Date.now() },
    { role: "assistant", content: [{ type: "text", text: "acknowledged" }], stopReason: "end", timestamp: Date.now() },
  ],
  sessionId,
  sessionManager: { getCwd: () => "/tmp" },
  model: { provider: "ollama", id: "qwen2.5:0.5b" },
  getPlanModeState: () => ({ enabled: false }),
  isDisposed: false,
});
const offSession = mkSession(crypto.randomUUID());
const offCtl = new CortexIngestController({ session: offSession as any, settings: Settings.isolated({ "memory.backend": "cortex", "cortex.apiUrl": SCRATCH, "cortex.project": ACCEPT, "cortexingest.transcripts": false }), modelRegistry: undefined as any });
const offResult = await offCtl.ingestTranscript();
const offIds = await (await realFetch(`${SCRATCH}/sessions/ingested-ids`, { headers: { "X-Project": ACCEPT } })).json().catch(() => ({ ids: [] }));
log(`A7: default-off ingestTranscript=${offResult} (must be false) off-session-ingested=${(offIds.ids ?? []).includes(offSession.sessionId)} (must be false)`);
const onSession = mkSession(crypto.randomUUID());
const onCtl = new CortexIngestController({ session: onSession as any, settings: Settings.isolated({ "memory.backend": "cortex", "cortex.apiUrl": SCRATCH, "cortex.project": ACCEPT, "cortexingest.transcripts": true }), modelRegistry: undefined as any });
const onResult = await onCtl.ingestTranscript();
const onIds = await (await realFetch(`${SCRATCH}/sessions/ingested-ids`, { headers: { "X-Project": ACCEPT } })).json();
const onIngested = (onIds.ids ?? []).includes(onSession.sessionId);
const tHits = await writer.search("transcript probe", 20);
const tStored = tHits.map(h => h.text).join("\n");
log(`A7: opt-in ingestTranscript=${onResult} (must be true) session=${onSession.sessionId} session-ingested=${onIngested} (must be true) transcript-text-stored=${tStored.includes("transcript probe")} literal-fake-in-transcript=${tStored.includes(fake)} (must be false)`);

// finally: terminal cleanup is the normative reset+up (this image has no typed
// archive route; A11's archive implementation is not in the running scratch
// image). The driver runs cortex-test.sh reset+up after this process exits.
const prodAfter = {
  health: await (await realFetch(`${PROD}/health`)).json(),
  project: await (await realFetch(`${PROD}/projects/${PROD_PROJECT}`)).json(),
};
log(`finally: production unchanged=${JSON.stringify(prodAfter.project) === JSON.stringify(prodBefore.project)} (must be true)`);
log("finally: terminal cleanup delegated to cortex-test.sh reset+up");
await Bun.write("/tmp/e024-drive-output.txt", out.join("\n") + "\n");
log("DRIVE COMPLETE");
