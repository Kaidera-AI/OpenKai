/**
 * E017 core-wiring tests (CoreWiring slice):
 *
 *  1. compactSession — real LLM-summarising compaction over the faux provider:
 *     the scripted summary replaces the pre-cut history, the retained tail
 *     survives verbatim, before/after token estimates are reported, the
 *     incremental path forwards `previousSummary` to the summariser, and
 *     contexts with nothing worth compacting return undefined.
 *  2. listUserMessages / forkAtEntry — the fork picker's rows and the
 *     rewind-to-point fork: root→entryId path copied into a fresh session id
 *     with re-anchored parentIds and parentSessionId provenance.
 *  3. tool_execution_update mapping — pi-agent-core's onUpdate partials
 *     surface on the SessionEvent stream as kind "tool_update".
 *  4. task onUpdate progress — the child pump emits pinned-shape partials
 *     ({ status, currentTool?, toolCount, turnDepth, sessionId, elapsedMs })
 *     through the tool's onUpdate channel; the settled result is unchanged.
 *
 * Runner: node:test against built output (see test:build). Fully offline:
 * the faux provider scripts every LLM call; sessions live in tmp roots.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import type { Context } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai/providers/faux";
import type { AgentMessage, AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  InProcessTransport,
  SessionStore,
  activeChildren,
  mapAgentEvent,
  taskTool,
  type TaskProgress,
} from "@kaidera/openkai-core";

/** Swap one env var around a test body; always restored. */
async function withEnv(name: string, value: string | undefined, body: () => Promise<void>): Promise<void> {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await body();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

/** Joined text of a message content value (string or content-part array). */
function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content as unknown[]) {
    if (part !== null && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string") {
      parts.push(part.text);
    }
  }
  return parts.join("\n");
}

/** The text of the single user prompt the summariser was called with. */
function summariserPromptOf(context: Context): string {
  const first = context.messages[0];
  if (first === undefined || first.role !== "user") return "";
  return textOfContent(first.content);
}

/** Joined text of an agent message's content. */
function textOfMessage(message: AgentMessage): string {
  return textOfContent((message as { content?: unknown }).content);
}

/** A faux-backed transport with `messages` seeded as the live context. */
function buildSeededTransport(messages: AgentMessage[]): {
  transport: InProcessTransport;
  seen: string[];
} {
  const seen: string[] = [];
  const faux = fauxProvider({});
  // One scripted summariser response per compactSession call; the factory
  // records the exact prompt so tests can assert the incremental path.
  faux.setResponses([
    (context: Context) => {
      seen.push(summariserPromptOf(context));
      return fauxAssistantMessage([fauxText("## Goal\nScripted checkpoint summary")]);
    },
    (context: Context) => {
      seen.push(summariserPromptOf(context));
      return fauxAssistantMessage([fauxText("## Goal\nSecond checkpoint summary")]);
    },
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  const transport = new InProcessTransport({
    sessionId: `e017-compact-${seen.length}-${Math.random().toString(36).slice(2)}`,
    modelId: "faux-1",
    models,
    provider: "faux",
    cwd: process.cwd(),
  });
  transport.setMessages(messages);
  return { transport, seen };
}

/** Alternating user/assistant messages with ~5k tokens each (20k chars). */
function bigConversation(count: number): AgentMessage[] {
  const chunk = "x".repeat(20_000);
  const messages: AgentMessage[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i % 2 === 0) {
      messages.push({ role: "user", content: `question ${i} ${chunk}`, timestamp: 1000 + i });
    } else {
      messages.push(fauxAssistantMessage([fauxText(`answer ${i} ${chunk}`)]));
    }
  }
  return messages;
}

// ── 1. compactSession ───────────────────────────────────────────────────────

test("compactSession: summary replaces pre-cut history, tail retained, tokens reported", async () => {
  const original = bigConversation(12); // ≈ 60k tokens — well over the 20k retained budget
  const { transport, seen } = buildSeededTransport(original);
  try {
    const result = await transport.compactSession();
    assert.ok(result !== undefined, "a 60k-token conversation must be compactable");
    assert.equal(result.summary, "## Goal\nScripted checkpoint summary");
    assert.ok(result.before > 50_000, `before estimate should reflect the seeded bulk (got ${result.before})`);
    assert.ok(result.after < result.before, "compaction must shrink the context");

    const compacted = transport.getMessages();
    assert.ok(compacted.length < original.length, "the context must be shorter than before");
    // Head: the summary travels as a user-role message wrapping the
    // structured checkpoint (our role-filtering convertToLlm keeps it).
    const head = compacted[0]!;
    assert.equal(head.role, "user");
    const headText = textOfMessage(head);
    assert.ok(headText.includes("<summary>"), "head carries the compaction summary wrapper");
    assert.ok(headText.includes("## Goal\nScripted checkpoint summary"));
    // Tail: the most recent messages survive verbatim.
    assert.deepEqual(compacted[compacted.length - 1], original[original.length - 1]);
    assert.deepEqual(compacted[compacted.length - 2], original[original.length - 2]);

    // The fresh (non-incremental) path must not reference a previous summary.
    assert.equal(seen.length, 1);
    assert.ok(!seen[0]!.includes("<previous-summary>"));
    assert.ok(seen[0]!.includes("structured context checkpoint summary"));
  } finally {
    await transport.close();
  }
});

test("compactSession: previousSummary takes the incremental UPDATE path", async () => {
  const { transport, seen } = buildSeededTransport(bigConversation(12));
  try {
    const result = await transport.compactSession("PRIOR SUMMARY TEXT");
    assert.ok(result !== undefined);
    assert.equal(seen.length, 1);
    assert.ok(seen[0]!.includes("<previous-summary>\nPRIOR SUMMARY TEXT\n</previous-summary>"));
    assert.ok(seen[0]!.includes("Update the existing structured summary"));
  } finally {
    await transport.close();
  }
});

test("compactSession: nothing worth compacting returns undefined", async () => {
  // Fewer than two messages.
  const lone = buildSeededTransport([{ role: "user", content: "hi", timestamp: 1 }]);
  try {
    assert.equal(await lone.transport.compactSession(), undefined);
  } finally {
    await lone.transport.close();
  }
  // A small conversation: the cut point keeps everything, so there is no
  // middle to summarise.
  const small = buildSeededTransport([
    { role: "user", content: "hello", timestamp: 1 },
    fauxAssistantMessage([fauxText("hi there")]),
  ]);
  try {
    assert.equal(await small.transport.compactSession(), undefined);
    assert.equal(small.seen.length, 0, "no summariser call may fire when nothing is compacted");
  } finally {
    await small.transport.close();
  }
});

// ── 2. listUserMessages / forkAtEntry ───────────────────────────────────────

test("listUserMessages + forkAtEntry: chain integrity and provenance", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ok-e017-fork-"));
  const store = new SessionStore({ root });
  await store.ensure();
  let fork: SessionStore | undefined;
  try {
    const id1 = await store.appendMessage({ role: "user", content: "first question\nwith details", timestamp: 1 });
    await store.appendMessage(fauxAssistantMessage([fauxText("answer one")]));
    const id3 = await store.appendMessage({ role: "user", content: "second question", timestamp: 3 });
    await store.appendMessage(fauxAssistantMessage([fauxText("answer two")]));

    const users = await store.listUserMessages();
    assert.equal(users.length, 2);
    assert.equal(users[0]!.entryId, id1);
    assert.equal(users[0]!.text, "first question with details", "picker text is single-line-normalised");
    assert.ok(users[0]!.timestamp > 0 && users[1]!.timestamp >= users[0]!.timestamp, "rows carry entry timestamps in append order");
    assert.equal(users[1]!.entryId, id3);

    fork = await store.forkAtEntry(id3);
    assert.notEqual(fork.sessionId, store.sessionId, "the fork is a NEW session id");
    const header = await fork.readHeader();
    assert.equal(header?.parentSessionId, store.sessionId, "provenance names the source session");

    // Only the root→entryId path was copied (3 of 4 entries), re-anchored.
    const entries = await fork.readEntries();
    assert.equal(entries.length, 3);
    assert.equal(entries[0]!.parentId, null);
    assert.equal(entries[1]!.parentId, entries[0]!.id);
    assert.equal(entries[2]!.parentId, entries[1]!.id);
    assert.notEqual(entries[0]!.id, id1, "entry ids are re-minted on the fork");
    assert.deepEqual(entries[0]!.type === "message" ? entries[0]!.message : null, {
      role: "user",
      content: "first question\nwith details",
      timestamp: 1,
    });
    assert.deepEqual(entries[2]!.type === "message" ? entries[2]!.message : null, {
      role: "user",
      content: "second question",
      timestamp: 3,
    });

    // The fork continues its own chain — the source is untouched.
    await fork.appendMessage({ role: "user", content: "forked continuation", timestamp: 5 });
    const grown = await fork.readEntries();
    assert.equal(grown.length, 4);
    assert.equal(grown[3]!.parentId, entries[2]!.id);
    assert.equal((await store.readEntries()).length, 4);

    // An unknown fork point is a named failure, never a partial copy.
    await assert.rejects(() => store.forkAtEntry("no-such-entry"), /not an entry of session/);
  } finally {
    await fork?.close();
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

// ── 3. tool_execution_update → SessionEvent "tool_update" ───────────────────

test("mapAgentEvent: tool_execution_update surfaces as a tool_update SessionEvent", () => {
  const progress: TaskProgress = {
    status: "running",
    currentTool: "read_file",
    toolCount: 3,
    turnDepth: 1,
    sessionId: "task-x",
    elapsedMs: 42,
  };
  const mapped = mapAgentEvent({
    type: "tool_execution_update",
    toolCallId: "tc-1",
    toolName: "task",
    args: { prompt: "scan" },
    partialResult: { content: [], details: progress },
  });
  assert.equal(mapped.length, 1);
  const event = mapped[0]!;
  assert.equal(event.kind, "tool_update");
  if (event.kind === "tool_update") {
    assert.equal(event.toolCallId, "tc-1");
    assert.equal(event.toolName, "task");
    const partial = event.partial as { details: TaskProgress };
    assert.deepEqual(partial.details, progress);
  }
});

// ── 4. task onUpdate progress ───────────────────────────────────────────────

test("task tool: onUpdate partials carry the pinned progress shape; settled result unchanged", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "ok-e017-prog-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "ok-e017-prog-cwd-"));
  await withEnv("OPENKAI_HOME", home, async () => {
    await withEnv("OPENROUTER_API_KEY", "test-key-e017-progress", async () => {
      try {
        const partials: TaskProgress[] = [];
        const tool = taskTool(cwd, "ai21/jamba-large-1.7");
        const controller = new AbortController();
        const run = tool.execute(
          "tc-e017-progress",
          { prompt: "reply with ok", timeoutSeconds: 30 },
          controller.signal,
          (partial: AgentToolResult<unknown>) => {
            partials.push(partial.details as TaskProgress);
          },
        );

        // Registration is synchronous — the child is named before it settles.
        const ids = activeChildren();
        assert.equal(ids.length, 1);
        const sessionId = ids[0]!;

        controller.abort();
        const result = await run;

        // The settled shape is the pre-E017 one: error text + details.
        const details = result.details as Record<string, unknown>;
        assert.equal(details["sessionId"], sessionId);
        assert.equal(details["stopped"], "aborted");

        // Progress partials: first a "running" snapshot, last the terminal
        // "aborted" one; every partial carries the pinned fields.
        assert.ok(partials.length >= 2, `expected running + terminal partials (got ${partials.length})`);
        const first = partials[0]!;
        assert.equal(first.status, "running");
        assert.equal(first.sessionId, sessionId);
        assert.equal(first.toolCount, 0);
        assert.equal(first.turnDepth, 0);
        assert.equal(typeof first.elapsedMs, "number");
        assert.equal(partials[partials.length - 1]!.status, "aborted");
        for (const p of partials) {
          assert.equal(p.sessionId, sessionId);
          assert.ok(p.toolCount >= 0 && p.turnDepth >= 0);
        }
      } finally {
        await rm(home, { recursive: true, force: true });
        await rm(cwd, { recursive: true, force: true });
      }
    });
  });
});
