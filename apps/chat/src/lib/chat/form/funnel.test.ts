import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancelForm,
  consumeOfferReply,
  funnelPhase,
  OFFER_CHOICE_FILL,
  OFFER_CHOICE_LINK,
  offerForm,
  parkHandoff,
  pinForm,
  recordMissOutcome,
} from "./funnel";
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

test("funnelPhase names the state the ad-hoc fields encode", () => {
  assert.equal(funnelPhase(session()), "exploring");
  assert.equal(funnelPhase(session({ slug: "x" })), "collecting");
  assert.equal(
    funnelPhase(session({ slug: "x", status: "submitted" })),
    "submitted",
  );
  assert.equal(
    funnelPhase(session({ offeredForm: { slug: "x", title: "X" } })),
    "offered",
  );
  assert.equal(funnelPhase(session({ handedOffSlug: "x" })), "handed-off");
});

test("pinForm resets prior form state and clears any pending offer", () => {
  const s = session({
    slug: "old",
    values: { a: "1" },
    offeredForm: { slug: "other", title: "Other" },
  });
  pinForm(s, "new-form");
  assert.equal(s.slug, "new-form");
  assert.deepEqual(s.values, {});
  assert.equal(s.offeredForm, undefined);
});

// The offer click is a deterministic confirm: exact label match pins the
// form ("fill it here") or parks it ("just the link") — code, not model
// interpretation.
test("consumeOfferReply: fill pins, link parks, anything else lapses", () => {
  const offer = { slug: "mail-redirect", title: "Mail Redirect" };

  const accepted = session({ offeredForm: { ...offer } });
  assert.deepEqual(consumeOfferReply(accepted, OFFER_CHOICE_FILL), {
    kind: "accepted",
    slug: "mail-redirect",
  });
  assert.equal(accepted.slug, "mail-redirect");
  assert.equal(funnelPhase(accepted), "collecting");

  const linked = session({ offeredForm: { ...offer } });
  assert.deepEqual(consumeOfferReply(linked, OFFER_CHOICE_LINK), {
    kind: "link",
    slug: "mail-redirect",
    title: "Mail Redirect",
  });
  assert.equal(linked.slug, null);
  // Parked: the matcher window / RAG fallback won't re-surface it next turn.
  assert.equal(linked.handedOffSlug, "mail-redirect");

  const lapsed = session({ offeredForm: { ...offer } });
  assert.equal(consumeOfferReply(lapsed, "what does it cost?"), null);
  assert.equal(lapsed.offeredForm, undefined);
  assert.equal(funnelPhase(lapsed), "exploring");

  // No pending offer → inert.
  assert.equal(consumeOfferReply(session(), OFFER_CHOICE_FILL), null);
});

test("offerForm + cancelForm transitions", () => {
  const s = session();
  offerForm(s, { slug: "x", title: "X" });
  assert.equal(funnelPhase(s), "offered");

  const c = session({ slug: "mail-redirect", values: { a: "1" } });
  cancelForm(c);
  assert.equal(c.slug, null);
  assert.deepEqual(c.values, {});
  assert.equal(c.handedOffSlug, "mail-redirect");
  assert.equal(funnelPhase(c), "handed-off");
});

// On a retrieval miss we clarify ONCE, then disclose we can't help instead of
// re-asking turn over turn (#1176). The first miss returns clarifyExhausted
// false (clarify), the second+ consecutive miss returns true (can't-help). Any
// non-miss turn resets the streak.
test("recordMissOutcome: clarify once, then exhaust on the next consecutive miss", () => {
  const s = session();

  // First miss → clarify (not exhausted).
  assert.deepEqual(recordMissOutcome(s, true), { clarifyExhausted: false });
  assert.equal(s.consecutiveMisses, 1);

  // Second consecutive miss → exhausted (can't-help).
  assert.deepEqual(recordMissOutcome(s, true), { clarifyExhausted: true });
  assert.equal(s.consecutiveMisses, 2);

  // Third consecutive miss stays exhausted — it never loops back to clarify.
  assert.deepEqual(recordMissOutcome(s, true), { clarifyExhausted: true });
  assert.equal(s.consecutiveMisses, 3);
});

test("recordMissOutcome: a non-miss turn resets the streak to clarify-once", () => {
  const s = session({ consecutiveMisses: 2 });

  // A grounded (non-miss) turn breaks the streak.
  assert.deepEqual(recordMissOutcome(s, false), { clarifyExhausted: false });
  assert.equal(s.consecutiveMisses, 0);

  // The next miss starts a fresh clarify, not a can't-help.
  assert.deepEqual(recordMissOutcome(s, true), { clarifyExhausted: false });
  assert.equal(s.consecutiveMisses, 1);
});

test("parkHandoff clears the pin and any pending offer", () => {
  const s = session({
    slug: "x",
    offeredForm: { slug: "y", title: "Y" },
  });
  parkHandoff(s, "x");
  assert.equal(s.slug, null);
  assert.equal(s.offeredForm, undefined);
  assert.equal(s.handedOffSlug, "x");
});
