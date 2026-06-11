import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "@tanstack/ai";
import type { FormIndexEntry } from "./defs";
import { applyRagFallback, pinSessionForm } from "./routing";
import type { FormResolution } from "./schema";
import type { FormSession } from "./session";

function session(overrides: Partial<FormSession> = {}): FormSession {
  return {
    threadId: "t1",
    slug: null,
    handedOffSlug: null,
    values: {},
    askedFieldIds: new Set<string>(),
    reviewedSinceChange: false,
    submissionId: "s1",
    status: "collecting",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function userMessage(text: string): UIMessage {
  return {
    id: "m1",
    role: "user",
    parts: [{ type: "text", content: text }],
  } as unknown as UIMessage;
}

const entry = (formId: string): FormIndexEntry =>
  ({ formId, titleToks: new Set() }) as unknown as FormIndexEntry;

// ---------------------------------------------------------------------------
// pinSessionForm
// ---------------------------------------------------------------------------

test("pinSessionForm leaves an active unsubmitted form pinned (matcher not consulted)", async () => {
  const s = session({ slug: "mail-redirect", values: { a: "1" } });
  let called = 0;
  await pinSessionForm(s, [userMessage("birth certificate please")], {
    match: async () => {
      called++;
      return entry("get-birth-certificate");
    },
  });
  assert.equal(s.slug, "mail-redirect");
  assert.equal(called, 0);
});

test("pinSessionForm pins a window match and resets prior state on a switch", async () => {
  const s = session({
    slug: "old-form",
    status: "submitted",
    values: { a: "1" },
    referenceNumber: "R1",
  });
  await pinSessionForm(s, [userMessage("post office redirection")], {
    match: async () => entry("post-office-redirection-individual"),
  });
  assert.equal(s.slug, "post-office-redirection-individual");
  assert.deepEqual(s.values, {});
  assert.equal(s.referenceNumber, undefined);
});

// The cancel/handoff suppression: a rolling-window match for the parked form
// defers to the LATEST message only, so the user isn't re-pinned by their own
// earlier messages — but a fresh mention re-engages deliberately.
test("pinSessionForm defers a window match of the parked slug to the latest message", async () => {
  const s = session({ handedOffSlug: "conductor-licence" });
  const calls: string[] = [];
  await pinSessionForm(s, [userMessage("thanks, bye")], {
    match: async (text) => {
      calls.push(text);
      // Window text still names the parked form; the latest message doesn't.
      return calls.length === 1 ? entry("conductor-licence") : null;
    },
  });
  assert.equal(s.slug, null);
  assert.equal(calls.length, 2);
});

// A submitted REAL service form is terminal too: park it (don't leave it
// pinned) so the next turn resolves to "none" and model-initiated feedback can
// be offered (#1203). Parking defers the rolling-window matcher to the LATEST
// message, so the user's own earlier application messages don't re-wedge them
// into the finished form.
test("pinSessionForm parks a submitted real form so feedback can be offered", async () => {
  const s = session({
    slug: "mail-redirect",
    status: "submitted",
    values: { a: "1" },
    referenceNumber: "R1",
  });
  const calls: string[] = [];
  await pinSessionForm(s, [userMessage("thanks, that's all")], {
    match: async (text) => {
      calls.push(text);
      // Window text still names the just-submitted form; the latest doesn't.
      return calls.length === 1 ? entry("mail-redirect") : null;
    },
  });
  assert.equal(s.slug, null);
  assert.equal(s.handedOffSlug, "mail-redirect");
  // Deferred to the latest message (matches nothing), so it stays unpinned.
  assert.equal(calls.length, 2);
});

test("pinSessionForm resets a submitted feedback session instead of wedging", async () => {
  const s = session({
    slug: "chat-feedback",
    status: "submitted",
    feedbackOffered: true,
    values: { rating: "5" },
  });
  await pinSessionForm(s, [userMessage("ok thanks")], {
    match: async () => null,
  });
  assert.equal(s.slug, null);
  assert.equal(s.status, "collecting");
  // The offer stays spent — never re-offered this session.
  assert.equal(s.feedbackOffered, true);
});

// ---------------------------------------------------------------------------
// applyRagFallback
// ---------------------------------------------------------------------------

const SIGNAL = new AbortController().signal;

// Top retrieved source must be a service doc above threshold for a candidate;
// these fixtures mirror retrieval.ts topHandoffCandidateSlug's contract.
const serviceSource = (slug: string) => ({
  id: `service-${slug}`,
  score: 0.9,
});

function ragDeps(resolution: FormResolution, slugs: string[]) {
  return {
    getSlugs: async () => slugs,
    getAllSlugs: async () => slugs,
    resolve: async () => resolution,
    formsUrl: () => "https://forms.test",
  };
}

test("applyRagFallback parks and hands off a fresh handoff candidate", async () => {
  const s = session();
  const handoff: FormResolution = {
    kind: "handoff",
    slug: "conductor-licence",
    title: "Conductor licence",
    url: "https://forms.test/forms/conductor-licence",
  };
  const out = await applyRagFallback(
    { kind: "none" },
    s,
    [serviceSource("conductor-licence")],
    SIGNAL,
    ragDeps(handoff, ["conductor-licence"]),
  );
  assert.equal(out.resolution.kind, "handoff");
  assert.equal(s.handedOffSlug, "conductor-licence");
});

test("applyRagFallback returns a continuation for the already-parked form", async () => {
  const s = session({ handedOffSlug: "conductor-licence" });
  const handoff: FormResolution = {
    kind: "handoff",
    slug: "conductor-licence",
    title: "Conductor licence",
    url: "https://forms.test/forms/conductor-licence",
  };
  const out = await applyRagFallback(
    { kind: "none" },
    s,
    [serviceSource("conductor-licence")],
    SIGNAL,
    ragDeps(handoff, ["conductor-licence"]),
  );
  assert.equal(out.resolution.kind, "none");
  assert.equal(out.handoffContinuation?.title, "Conductor licence");
});

test("applyRagFallback offers (never auto-collects) a collect form", async () => {
  const s = session();
  const collect = {
    kind: "collect",
    form: { contract: { title: "Business Mail Redirect" } },
  } as unknown as FormResolution;
  const out = await applyRagFallback(
    { kind: "none" },
    s,
    [serviceSource("business-mail-redirect")],
    SIGNAL,
    ragDeps(collect, ["business-mail-redirect"]),
  );
  // ADR 0048: the fuzzy RAG signal puts an OFFER on the table; the user's
  // tap is the confirm. No pin, no collection this turn.
  assert.equal(out.resolution.kind, "none");
  assert.deepEqual(out.formOffer, {
    slug: "business-mail-redirect",
    title: "Business Mail Redirect",
  });
  assert.deepEqual(s.offeredForm, out.formOffer);
  assert.equal(s.slug, null);
});

test("applyRagFallback computes no candidate when a form is pinned or matched", async () => {
  const pinned = session({ slug: "some-form" });
  let resolved = 0;
  const deps = {
    getSlugs: async () => ["x"],
    getAllSlugs: async () => ["x"],
    resolve: async () => {
      resolved++;
      return { kind: "none" } as FormResolution;
    },
    formsUrl: () => "https://forms.test",
  };
  const out = await applyRagFallback(
    { kind: "none" },
    pinned,
    [serviceSource("x")],
    SIGNAL,
    deps,
  );
  assert.equal(out.resolution.kind, "none");
  assert.equal(resolved, 0);
});

test("applyRagFallback skips unpublished candidates (no doomed contract fetch)", async () => {
  const s = session();
  let resolved = 0;
  const deps = {
    getSlugs: async () => ["another-form"],
    getAllSlugs: async () => ["another-form"],
    resolve: async () => {
      resolved++;
      return { kind: "none" } as FormResolution;
    },
    formsUrl: () => "https://forms.test",
  };
  await applyRagFallback(
    { kind: "none" },
    s,
    [serviceSource("info-only-service")],
    SIGNAL,
    deps,
  );
  assert.equal(resolved, 0);
});

// Published but not chat-approved: never surfaced, but flagged so the
// disclosure doesn't lie that no online form exists (school-uniform-grant
// class — it was on the old exclusion list yet absent from the allowlist).
test("applyRagFallback flags a published-but-unapproved form", async () => {
  const s = session();
  let resolved = 0;
  const deps = {
    getSlugs: async () => ["approved-form"],
    getAllSlugs: async () => ["approved-form", "school-uniform-grant-barbados"],
    resolve: async () => {
      resolved++;
      return { kind: "none" } as FormResolution;
    },
    formsUrl: () => "https://forms.test",
  };
  const out = await applyRagFallback(
    { kind: "none" },
    s,
    [serviceSource("school-uniform-grant-barbados")],
    SIGNAL,
    deps,
  );
  assert.equal(out.unapprovedForm, true);
  assert.equal(out.resolution.kind, "none");
  // Never resolved against the forms API — not surfaced, only flagged.
  assert.equal(resolved, 0);
  assert.equal(s.slug, null);
});
