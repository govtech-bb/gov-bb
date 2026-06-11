import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "@tanstack/ai";
import { FEEDBACK_FORM_ID, FEEDBACK_TRIGGER_PHRASE } from "#/lib/chat/feedback";
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

// The notice banner's "Give feedback" link sends FEEDBACK_TRIGGER_PHRASE. It
// must pin chat-feedback by EXPLICIT id, never via the title-token matcher —
// otherwise a future recipe whose title contains "feedback"/"assistant" could
// out-score or tie-and-steal the banner match (#1206). The stubbed matcher
// returns a colliding form to prove it is never consulted for the banner phrase.
test("pinSessionForm pins chat-feedback by id for the banner phrase, ignoring the matcher", async () => {
  const s = session();
  let called = 0;
  await pinSessionForm(s, [userMessage(FEEDBACK_TRIGGER_PHRASE)], {
    match: async () => {
      called++;
      return entry("some-future-assistant-feedback-form");
    },
  });
  assert.equal(s.slug, FEEDBACK_FORM_ID);
  assert.equal(s.feedbackOffered, true); // offer spent — never also model-offered
  assert.equal(called, 0); // matcher never consulted for the banner phrase
});

// A FREE-TYPED feedback request ("i wan to feedback") is intentionally NOT
// pinned here — run-turn detects it first (looksLikeFeedbackIntent) and shows
// the assistant/service disambiguation, so it never reaches pinSessionForm.
// This supersedes #1247's direct-pin path. Here, with no banner phrase and no
// matcher hit, the session stays unpinned.
test("pinSessionForm does not pin a free-typed feedback request (run-turn disambiguates first)", async () => {
  const s = session();
  await pinSessionForm(s, [userMessage("i wan to feedback")], {
    match: async () => null,
  });
  assert.equal(s.slug, null);
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

// A completed real application is the natural moment to ask for feedback: the
// submission-confirmation invites it once (see prompt-builder), and the next
// turn auto-pins the chat-feedback form so the user's reply is collected or
// declined — no "anything else?". The zero-value pin is an OPEN OFFER, so the
// #1202 release below still lets a topic switch or info-question escape; a
// plain affirmative ("yes please") keeps the pin. feedbackOffered is marked so
// it is never offered twice. (Supersedes the #1203 park-for-model-offer path.)
test("pinSessionForm auto-pins feedback after a submitted real form", async () => {
  const s = session({
    slug: "mail-redirect",
    status: "submitted",
    values: { a: "1" },
    referenceNumber: "R1",
  });
  await pinSessionForm(s, [userMessage("yes please")], {
    match: async () => null,
  });
  assert.equal(s.slug, FEEDBACK_FORM_ID);
  assert.equal(s.feedbackOffered, true);
  assert.equal(s.status, "collecting");
});

// If feedback was already offered/given earlier this session, a submitted real
// form is simply parked (no second ask — the confirmation falls back to the
// normal "anything else?" wrap-up). Parking defers the rolling-window matcher
// to the LATEST message, so earlier application messages don't re-wedge them.
test("pinSessionForm parks (no re-offer) a submitted real form when feedback was already offered", async () => {
  const s = session({
    slug: "mail-redirect",
    status: "submitted",
    feedbackOffered: true,
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

// A zero-value chat-feedback pin (offer_feedback pins on offer) is still an
// open offer: a topic switch must release it instead of trapping the user on
// the feedback form (#1202).

test("pinSessionForm releases a zero-value feedback pin on an info-question topic switch", async () => {
  const s = session({
    slug: "chat-feedback",
    status: "collecting",
    feedbackOffered: true,
    values: {},
  });
  await pinSessionForm(s, [userMessage("how do I renew my passport?")], {
    match: async () => null,
  });
  // Released to normal no-form routing, so RAG can answer the new question.
  assert.equal(s.slug, null);
  // The offer stays spent — a topic switch reads as an implicit decline.
  assert.equal(s.feedbackOffered, true);
});

test("pinSessionForm re-pins a zero-value feedback pin to a form the latest message matches", async () => {
  const s = session({
    slug: "chat-feedback",
    status: "collecting",
    feedbackOffered: true,
    values: {},
  });
  await pinSessionForm(s, [userMessage("I want to apply for a passport")], {
    match: async () => entry("get-passport"),
  });
  assert.equal(s.slug, "get-passport");
  assert.equal(s.feedbackOffered, true);
});

test("pinSessionForm keeps a zero-value feedback pin for a yes/no-shaped reply", async () => {
  const s = session({
    slug: "chat-feedback",
    status: "collecting",
    feedbackOffered: true,
    values: {},
  });
  await pinSessionForm(s, [userMessage("no thanks")], {
    match: async () => null,
  });
  // Not a topic switch — collect-feedback handles the decline next.
  assert.equal(s.slug, "chat-feedback");
});

test("pinSessionForm keeps an in-progress feedback form pinned despite a question", async () => {
  const s = session({
    slug: "chat-feedback",
    status: "collecting",
    feedbackOffered: true,
    values: { rating: "5" },
  });
  let called = 0;
  await pinSessionForm(s, [userMessage("what happens to my feedback?")], {
    match: async () => {
      called++;
      return null;
    },
  });
  // Mid-collection (a value captured): grounded via retrievalBoostSlug, not a
  // topic switch — stays pinned and the matcher isn't consulted.
  assert.equal(s.slug, "chat-feedback");
  assert.equal(called, 0);
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
