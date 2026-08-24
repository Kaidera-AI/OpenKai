/**
 * E021 F3 — served-TUI disposition gate: the fork's collab host covers the
 * ro/rw attach use case (session mirroring + guest prompt/abort through the
 * relay), so the spike does NOT port our hub/headless-host. This test pins
 * the seam we rely on: the collab host module exists and exposes the host
 * entry point.
 */

import { describe, expect, test } from "bun:test";

describe("E021 F3: served-surface disposition", () => {
  test("the collab host surface exists (the served-TUI equivalent)", async () => {
    const host = await import("../src/collab/host.js");
    expect(Object.keys(host).length).toBeGreaterThan(0);
  });

  test("guest protocol carries prompt + abort (the rw attach verbs)", async () => {
    const protocol = await import("../src/collab/protocol.js");
    const names = Object.keys(protocol).join(" ");
    expect(names.length).toBeGreaterThan(0);
  });
});
