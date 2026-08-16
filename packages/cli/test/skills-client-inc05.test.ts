/**
 * E002 Inc 05 core skill client tests — verifies the CortexClient skill
 * methods (listSkills, registerSkill, deleteSkill, bindSkill) call the
 * correct HTTP endpoints with the correct payloads. Uses an injectable fake
 * fetch — no real Cortex API calls.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CortexApiError,
  type SkillBindPayload,
  type SkillRegisterPayload,
} from "@kaidera/openkai-core";
import { CortexClient } from "@kaidera/openkai-core";

/** A fake fetch that records calls and returns canned responses. */
function makeFakeFetch(
  responses: Record<string, { status: number; body: string }[]> = {},
) {
  const calls: {
    method: string;
    path: string;
    body?: string;
    headers: Record<string, string>;
  }[] = [];
  const defaultResponses: Record<string, { status: number; body: string }[]> =
    {
      "GET /skills": [
        {
          status: 200,
          body: JSON.stringify({
            skills: [
              {
                skill_slug: "test-skill",
                name: "Test",
                description: "desc",
                scope: "global",
                version: "1",
              },
              {
                skill_slug: "another",
                name: "Another",
                scope: "project",
                version: "2",
              },
            ],
          }),
        },
      ],
      "POST /skills": [{ status: 200, body: "{}" }],
      "DELETE /skills": [{ status: 200, body: "{}" }],
      "POST /skills/*/bind": [{ status: 200, body: "{}" }],
    };
  const all = { ...defaultResponses, ...responses };

  const fakeFetch: typeof fetch = (async (input, init) => {
    const url =
      typeof input === "string" ? input : (input as URL).toString();
    const baseUrl = "http://localhost:8501";
    const path = url.replace(baseUrl, "");
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) headers[k] = v;
    }
    calls.push({
      method,
      path,
      body: init?.body as string | undefined,
      headers,
    });

    let key = `${method} ${path}`;
    let resp = all[key];
    if (!resp) {
      if (method === "POST" && path.match(/^\/skills\/[^/]+\/bind$/)) {
        key = "POST /skills/*/bind";
        resp = all[key];
      }
      if (method === "DELETE" && path.startsWith("/skills/")) {
        key = "DELETE /skills";
        resp = all[key];
      }
    }
    const r = resp?.shift() ?? { status: 200, body: "{}" };
    return new Response(r.body, {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return { fetch: fakeFetch, calls };
}

describe("skill client (Inc 05)", { concurrency: 1 }, () => {
  test("listSkills parses {skills:[]} response", async () => {
    const fake = makeFakeFetch();
    const client = new CortexClient({
      project: "test",
      baseUrl: "http://localhost:8501",
      fetch: fake.fetch,
    });
    const skills = await client.listSkills();
    assert.equal(skills.length, 2);
    assert.equal(skills[0]!.skill_slug, "test-skill");
    assert.equal(skills[0]!.scope, "global");
    assert.equal(skills[1]!.skill_slug, "another");
    assert.equal(skills[1]!.scope, "project");
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0]!.method, "GET");
    assert.equal(fake.calls[0]!.path, "/skills");
  });

  test("listSkills handles bare array response", async () => {
    const fake = makeFakeFetch({
      "GET /skills": [
        {
          status: 200,
          body: JSON.stringify([
            { skill_slug: "bare", scope: "global", version: "1" },
          ]),
        },
      ],
    });
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    const skills = await client.listSkills();
    assert.equal(skills.length, 1);
    assert.equal(skills[0]!.skill_slug, "bare");
  });

  test("listSkills handles empty skills array", async () => {
    const fake = makeFakeFetch({
      "GET /skills": [
        { status: 200, body: JSON.stringify({ skills: [] }) },
      ],
    });
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    const skills = await client.listSkills();
    assert.equal(skills.length, 0);
  });

  test("registerSkill sends POST /skills with payload", async () => {
    const fake = makeFakeFetch();
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    const payload: SkillRegisterPayload = {
      skill_slug: "new-skill",
      name: "New Skill",
      scope: "global",
      body_ref: ".agents/skills/new-skill/SKILL.md",
      body_hash: "abc123",
      version: "1",
    };
    await client.registerSkill(payload);
    const postCalls = fake.calls.filter(
      (c) => c.method === "POST" && c.path === "/skills",
    );
    assert.equal(postCalls.length, 1);
    const body = JSON.parse(postCalls[0]!.body!);
    assert.equal(body.skill_slug, "new-skill");
    assert.equal(body.scope, "global");
    assert.equal(body.name, "New Skill");
    assert.equal(body.body_hash, "abc123");
    assert.equal(postCalls[0]!.headers["X-Project"], "test");
  });

  test("deleteSkill sends DELETE /skills/{slug}", async () => {
    const fake = makeFakeFetch();
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    await client.deleteSkill("old-skill");
    const deleteCalls = fake.calls.filter((c) => c.method === "DELETE");
    assert.equal(deleteCalls.length, 1);
    assert.equal(deleteCalls[0]!.path, "/skills/old-skill");
  });

  test("deleteSkill URL-encodes the slug", async () => {
    const fake = makeFakeFetch();
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    await client.deleteSkill("skill with spaces");
    const deleteCalls = fake.calls.filter((c) => c.method === "DELETE");
    assert.equal(deleteCalls[0]!.path, "/skills/skill%20with%20spaces");
  });

  test("bindSkill sends POST /skills/{slug}/bind with payload", async () => {
    const fake = makeFakeFetch();
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    const payload: SkillBindPayload = {
      subject_kind: "role",
      subject: "developer",
      project: "openkai",
    };
    await client.bindSkill("my-skill", payload);
    const bindCalls = fake.calls.filter(
      (c) => c.method === "POST" && c.path.endsWith("/bind"),
    );
    assert.equal(bindCalls.length, 1);
    assert.equal(bindCalls[0]!.path, "/skills/my-skill/bind");
    const body = JSON.parse(bindCalls[0]!.body!);
    assert.equal(body.subject_kind, "role");
    assert.equal(body.subject, "developer");
    assert.equal(body.project, "openkai");
  });

  test("registerSkill throws CortexApiError on 422", async () => {
    const fake = makeFakeFetch({
      "POST /skills": [
        {
          status: 422,
          body: JSON.stringify({ detail: "missing skill_slug" }),
        },
      ],
    });
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    await assert.rejects(
      () => client.registerSkill({ skill_slug: "" }),
      (error: unknown) => {
        assert.ok(error instanceof CortexApiError);
        assert.equal(error.status, 422);
        return true;
      },
    );
  });

  test("deleteSkill throws CortexApiError on 404", async () => {
    const fake = makeFakeFetch({
      "DELETE /skills": [{ status: 404, body: '{"detail":"not found"}' }],
    });
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    await assert.rejects(
      () => client.deleteSkill("nonexistent"),
      (error: unknown) => {
        assert.ok(error instanceof CortexApiError);
        assert.equal(error.status, 404);
        return true;
      },
    );
  });

  test("empty DELETE body returns undefined", async () => {
    const fake = makeFakeFetch({
      "DELETE /skills": [{ status: 200, body: "" }],
    });
    const client = new CortexClient({ project: "test", baseUrl: "http://localhost:8501", fetch: fake.fetch });
    const result = await client.deleteSkill("some-skill");
    assert.equal(result, undefined);
  });

  test("listSkills sends X-Project header", async () => {
    const fake = makeFakeFetch();
    const client = new CortexClient({
      project: "my-project",
      baseUrl: "http://localhost:8501",
      fetch: fake.fetch,
    });
    await client.listSkills();
    assert.equal(fake.calls[0]!.headers["X-Project"], "my-project");
  });
});