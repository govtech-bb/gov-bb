import { setImmediate } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PageEditLockToken } from "../../src/api/page-schemas";
import {
  PageEditLockSession,
  type PageEditLockRuntime,
} from "../../src/workspace/page-edit-lock-session";
import { InMemoryPageEditLocks } from "../helpers/page-edit-locks";

const pageId = "11111111-1111-4111-8111-111111111111";

class TestClock implements PageEditLockRuntime {
  timeMs = Date.parse("2026-10-28T12:00:00Z");
  private counter = 0;
  readonly tasks = new Set<{ atMs: number; task: () => void }>();
  nowMs = () => this.timeMs;
  newToken() {
    const token = PageEditLockToken.parse(
      `00000000-0000-4000-8000-${(++this.counter).toString(16).padStart(12, "0")}`,
    );

    if (!token) throw new Error("Invalid test lock credential");

    return token;
  }
  schedule(delayMs: number, task: () => void) {
    const timer = { atMs: this.timeMs + delayMs, task };
    this.tasks.add(timer);

    return () => {
      this.tasks.delete(timer);
    };
  }
  async advance(ms: number) {
    const endMs = this.timeMs + ms;

    for (;;) {
      const next = [...this.tasks].sort((a, b) => a.atMs - b.atMs)[0];

      if (!next || next.atMs > endMs) break;
      this.tasks.delete(next);
      this.timeMs = Math.max(this.timeMs, next.atMs);
      next.task();
      await setImmediate();
    }

    this.timeMs = endMs;
    await setImmediate();
  }
}

function setup() {
  const clock = new TestClock();
  const api = new InMemoryPageEditLocks(clock);

  return { clock, api, session: new PageEditLockSession(pageId, api, clock) };
}

describe("active page edit lock lifecycle", () => {
  it("does no work on construction and releases only after confirmed departure", async () => {
    const h = setup();
    expect(h.api.requests).toEqual([]);
    h.session.activate();
    await setImmediate();
    const token = h.session.getEditLockToken();
    expect(token).toBeDefined();
    // A cancelled navigation doesn't change the active pane and therefore calls no lifecycle method.
    await h.clock.advance(30_000);
    expect(h.api.requests.map((r) => r.method)).toEqual(["read", "acquire", "renew"]);
    h.session.deactivate();
    await setImmediate();
    expect(h.api.requests.at(-1)).toEqual({ method: "release", token });
    expect(h.clock.tasks.size).toBe(0);
    await h.clock.advance(120_000);
    expect(h.api.requests).toHaveLength(4);
  });

  it("compensates a late acquisition without releasing a replacement's credential", async () => {
    const h = setup();
    const response = Promise.withResolvers<void>();
    h.api.acquireResponse = response.promise;
    h.session.activate();
    await setImmediate();
    const abandoned = h.api.claim?.token;
    h.session.deactivate();
    h.api.acquireResponse = undefined;
    h.session.activate();
    await setImmediate();
    expect(h.session.getSnapshot().kind).toBe("locked-by-another-session");
    h.session.takeOver(h.api.generation);
    await setImmediate();
    const replacement = h.session.getEditLockToken();
    response.resolve();
    await setImmediate();
    expect(replacement).toBeDefined();
    expect(replacement).not.toBe(abandoned);
    expect(h.api.claim?.token).toBe(replacement);
    expect(h.api.requests.at(-1)).toEqual({ method: "release", token: abandoned });
    h.session.deactivate();
  });

  it("detects another tab's takeover without reacquiring or renewing its replacement", async () => {
    const h = setup();
    h.session.activate();
    await setImmediate();
    const other = new PageEditLockSession(pageId, h.api, h.clock);
    other.activate();
    await setImmediate();
    expect(other.getSnapshot().kind).toBe("locked-by-another-session");
    other.takeOver(h.api.generation);
    await setImmediate();
    const winner = other.getEditLockToken();
    await h.clock.advance(30_000);
    expect(h.session.getEditLockToken()).toBeUndefined();
    h.session.reconcile();
    await setImmediate();
    expect(h.session.getSnapshot().kind).toBe("locked-by-another-session");
    expect(h.api.claim?.token).toBe(winner);
    expect(h.api.generation).toBe(2);
    h.session.deactivate();
    other.deactivate();
  });

  it("does not substitute a new holder generation for a reviewed takeover", async () => {
    const h = setup();
    h.session.activate();
    await setImmediate();
    const other = new PageEditLockSession(pageId, h.api, h.clock);
    other.activate();
    await setImmediate();
    const reviewed = h.api.generation;
    await h.api.acquirePageEditLock(pageId, h.clock.newToken(), {
      action: "takeover",
      expectedLockGeneration: reviewed,
    });
    other.takeOver(reviewed);
    await setImmediate();
    expect(other.getEditLockToken()).toBeUndefined();
    expect(h.api.generation).toBe(2);
    h.session.deactivate();
    other.deactivate();
  });

  it("prompts at the server's idle deadline and expires without an answer despite heartbeats", async () => {
    const h = setup();
    h.session.activate();
    await setImmediate();
    await h.clock.advance(600_000);
    expect(h.session.getSnapshot().kind).toBe("awaiting-idle-response");
    expect(h.session.getEditLockToken()).toBeUndefined();
    expect(h.api.claim?.sequence).toBe(0);
    await h.clock.advance(120_000);
    expect(h.session.getSnapshot()).toEqual({ kind: "lock-lost", reason: "expired" });
    expect(h.clock.tasks.size).toBe(0);
  });

  it("counts real edits and an explicit idle response, not presence reads", async () => {
    const h = setup();
    h.session.activate();
    await setImmediate();
    await h.clock.advance(300_000);
    h.session.reconcile();
    await setImmediate();
    expect(h.api.claim?.sequence).toBe(0);
    h.session.recordActivity();
    await h.clock.advance(30_000);
    expect(h.api.claim?.sequence).toBe(1);
    await h.clock.advance(600_000);
    expect(h.session.getSnapshot().kind).toBe("awaiting-idle-response");
    h.session.continueEditing();
    await setImmediate();
    expect(h.session.getSnapshot().kind).toBe("editable");
    expect(h.api.claim?.sequence).toBe(2);
    h.session.deactivate();
  });

  it("withholds ownership on auth/network failure and GET-reconciles before renewing", async () => {
    const h = setup();
    h.session.activate();
    await setImmediate();
    h.api.failure = { kind: "signed-out" };
    await h.clock.advance(30_000);
    expect(h.session.getSnapshot()).toEqual({
      kind: "lock-unconfirmed",
      failure: { kind: "signed-out" },
    });
    expect(h.session.getEditLockToken()).toBeUndefined();
    h.api.failure = undefined;
    h.session.reconcile();
    await setImmediate();
    expect(h.api.requests.at(-1)?.method).toBe("read");
    expect(h.session.getSnapshot().kind).toBe("editable");
    h.session.deactivate();
  });

  it("serializes resume reads behind an outstanding heartbeat and ignores its old acknowledgement", async () => {
    const h = setup();
    h.session.activate();
    await setImmediate();
    const response = Promise.withResolvers<void>();
    h.api.renewResponse = response.promise;
    await h.clock.advance(30_000);
    h.session.reconcile();
    h.session.reconcile();
    expect(h.session.getEditLockToken()).toBeUndefined();
    expect(h.api.requests.map((r) => r.method)).toEqual(["read", "acquire", "renew"]);
    await h.api.acquirePageEditLock(pageId, h.clock.newToken(), {
      action: "takeover",
      expectedLockGeneration: h.api.generation,
    });
    response.resolve();
    await setImmediate();
    expect(h.api.requests.at(-1)?.method).toBe("read");
    expect(h.session.getSnapshot().kind).toBe("locked-by-another-session");
    h.session.deactivate();
  });

  it("does not grant extra time from a delayed response or after waking past expiry", async () => {
    const h = setup();
    const response = Promise.withResolvers<void>();
    h.api.acquireResponse = response.promise;
    h.session.activate();
    await setImmediate();
    h.clock.timeMs += 180_000;
    response.resolve();
    await setImmediate();
    expect(h.session.getEditLockToken()).toBeUndefined();
    expect(h.session.getSnapshot().kind).toBe("lock-lost");
    expect(h.api.claim).toBeUndefined();
  });

  it("never exposes expired or replaced authority through generated activity/resume sequences", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom("edit", "heartbeat", "resume", "sleep", "stop", "start"), {
          maxLength: 60,
        }),
        async (actions) => {
          const h = setup();
          h.session.activate();
          await setImmediate();
          let explicitAcquisitions = 1;

          for (const action of actions) {
            switch (action) {
              case "edit":
                h.session.recordActivity();
                break;
              case "heartbeat":
                await h.clock.advance(30_000);
                break;
              case "resume":
                h.session.reconcile();
                break;
              case "sleep":
                h.clock.timeMs += 180_000;
                h.session.reconcile();
                break;
              case "stop":
                h.session.stopEditing();
                break;
              case "start":
                explicitAcquisitions++;
                h.session.startEditing();
                break;
            }

            await setImmediate();
            const token = h.session.getEditLockToken();

            if (token) {
              const status = await h.api.readPageEditLock(pageId, token);
              expect(status).toMatchObject({
                ok: true,
                value: { state: "held", ownedByCaller: true },
              });
            }

            expect(h.api.generation).toBeLessThanOrEqual(explicitAcquisitions);
          }

          h.session.deactivate();
          expect(h.clock.tasks.size).toBe(0);
        },
      ),
      { numRuns: 60 },
    );
  });
});
