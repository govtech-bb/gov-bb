import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEEDBACK_COLLECTION_GUIDANCE,
  FORM_COLLECTION_PROTOCOL,
  SYSTEM_PROMPT,
  buildHandoffContinuationDisclosure,
  buildHandoffDisclosure,
  buildHandoffOfferDisclosure,
  buildMissDisclosure,
} from "./prompts";

// The ILLEGITIMATE REQUESTS section must name bribery/corruption, so a
// fraud-framed "how much to pay to get my child into a better school" is
// declined rather than answered. Pairs with run-turn suppressing the form
// offer when the rewrite flags the request illegitimate.
test("system prompt declines bribery / paying for unfair advantage", () => {
  assert.match(SYSTEM_PROMPT, /ILLEGITIMATE REQUESTS/);
  assert.match(SYSTEM_PROMPT, /brib|unfair advantage/i);
});

// The form-collection / submit machinery lives in FORM_COLLECTION_PROTOCOL,
// injected only on active-form turns — NOT in the always-on SYSTEM_PROMPT.
// Guards against it creeping back into every turn (the overloading concern).
test("form-collection rules are out of the always-on system prompt", () => {
  assert.ok(!/set_field|submit_form|FORM COLLECTION:/.test(SYSTEM_PROMPT));
  // but the conversational + safety rules stay always-on
  assert.match(SYSTEM_PROMPT, /CONTEXT USE|ILLEGITIMATE REQUESTS/);
});

// The CHANNEL PREFERENCE section nudges informational turns online-first, but
// only WHEN the retrieved context shows an online path — it must stay silent /
// in-person for services with no online option, so it can't fight
// NO_FORM_DISCLOSURE or invent a path that isn't in the context (#1079).
test("system prompt nudges online-first, conditioned on the context", () => {
  assert.match(SYSTEM_PROMPT, /CHANNEL PREFERENCE|ONLINE FIRST/);
  // The nudge is gated on the context actually showing an online option...
  assert.match(
    SYSTEM_PROMPT,
    /context shows.*online|when.*online.*(exists|context)/i,
  );
  // ...and it must NOT invent an online path when the context has none.
  assert.match(SYSTEM_PROMPT, /no online option|don't invent an online/i);
});

// STRICT RAG recovery (#1099): a retrieval miss must not dead-end. The
// grounding rule still forbids inventing facts/services, but the recovery half
// now actively guides — name what was found, or ask a clarifying question —
// rather than stopping at a bare decline. It stays subordinate to ILLEGITIMATE
// REQUESTS (a fraud miss is declined, not "guided").
test("system prompt: a retrieval miss guides forward instead of hard-stopping", () => {
  assert.match(SYSTEM_PROMPT, /CONTEXT USE|STRICT RAG/);
  assert.match(SYSTEM_PROMPT, /never hard-stop/i);
  assert.match(SYSTEM_PROMPT, /clarifying question/i);
  // The no-invented-services guarantee stays explicit.
  assert.match(SYSTEM_PROMPT, /invent a service/i);
});

// buildMissDisclosure replaces the misapplied NO_FORM_DISCLOSURE on a genuine
// no-context turn (retrieval attempted, zero citations). It must keep guiding:
// ask a clarifying question, invent nothing, and NOT fabricate a "no online
// form" / paper conclusion it has no basis for.
test("miss disclosure: asks to clarify, invents nothing, doesn't fabricate a paper route", () => {
  const out = buildMissDisclosure();
  // Keeps guiding rather than dead-ending.
  assert.match(out, /clarifying question/i);
  assert.match(out, /DO NOT DEAD-END|nowhere to go/i);
  // Never invents a service it can't see in context.
  assert.match(out, /invent|guess a service/i);
  // Doesn't claim it knows there's no online form — it doesn't know the service.
  assert.match(out, /don't know yet|simply don't know/i);
  // Still defers to the fraud decline.
  assert.match(out, /illegitimate|fraud/i);
});

// On a successful feedback submit the model must thank the user and NOT recite
// a reference number — the generic protocol's "report the referenceNumber
// verbatim" rule would otherwise leak a permit-style reference onto a 30-second
// feedback form. The guidance both names the thank-you and forbids the
// reference, since it is the more specific instruction injected on feedback
// turns.
test("feedback guidance: a successful submit thanks the user with no reference number", () => {
  assert.match(FEEDBACK_COLLECTION_GUIDANCE, /submit_form/);
  assert.match(FEEDBACK_COLLECTION_GUIDANCE, /thank/i);
  assert.match(FEEDBACK_COLLECTION_GUIDANCE, /reference number/i);
  assert.match(
    FEEDBACK_COLLECTION_GUIDANCE,
    /no reference number|never.*reference|without.*reference/i,
  );
});

test("FORM_COLLECTION_PROTOCOL carries the collection + submit rules", () => {
  assert.match(FORM_COLLECTION_PROTOCOL, /set_field/);
  assert.match(FORM_COLLECTION_PROTOCOL, /submit_form/);
  assert.match(FORM_COLLECTION_PROTOCOL, /WHEN A FORM SCHEMA IS PROVIDED/);
});

// The continuation disclosure is shown on follow-up turns after a handoff. It
// must keep the form link in front of the user while preventing the two failure
// modes we saw on the post-handoff turn: hallucinated inline collection, and
// falsely claiming there is no online form.

const TITLE = "Apply for a Conductor Licence";
const URL = "https://forms.example/forms/apply-for-conductor-licence";

test("embeds the form link as a markdown link", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.ok(
    out.includes(`[${TITLE}](${URL})`),
    "should contain the markdown link",
  );
});

test("forbids inline collection", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.match(out, /collecting field values|what's your first name/i);
  assert.match(out, /set_field/);
});

test("forbids denying the online form exists", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.match(out, /no online form/i);
  assert.match(out, /in person/i);
});

test("allows informational answering from context", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.match(out, /informational|informationally/i);
});

// The OFFER disclosure is shown when the user asked an INFO question about a
// handoff service (e.g. "what does it cost and where do I apply?"). It must
// answer the question and offer the link in prose — but NOT paste a URL this
// turn (that's what keeps these off the "pushed a form" failure).
test("offer disclosure answers first, then offers the link", () => {
  const out = buildHandoffOfferDisclosure(TITLE);
  assert.match(out, /answer/i);
  assert.match(out, /offer the link|share the application link/i);
});

test("offer disclosure forbids pasting a URL or link this turn", () => {
  const out = buildHandoffOfferDisclosure(TITLE);
  assert.match(out, /no links at all|do not paste a url|paste a url/i);
  // It takes no URL argument and must not embed one.
  assert.ok(!/https?:\/\//.test(out), "offer disclosure must contain no URL");
});

// The handoff disclosure is the first reply that hands the user the form link.
// Issue #1065: the copy must read warm and supportive, not curt, while keeping
// the link-prominent shape and the guardrails that stop the #965 drift
// (skipping the link, hallucinating inline collection). #1079 follow-up: it no
// longer forbids the in-person / paper route, so both paths can be shown.

test("handoff: embeds the form link as a markdown link", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.ok(
    out.includes(`[${TITLE}](${URL})`),
    "should contain the markdown link",
  );
});

test("handoff: uses warm, supportive phrasing", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.match(out, /get started/i);
  // The old curt line must be gone.
  assert.doesNotMatch(out, /you'll need to complete it there/i);
});

test("handoff: guides on prerequisites from context", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.match(out, /prerequisite|need|bring|handy/i);
});

test("handoff: keeps the anti-drift guardrails", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  // No offering to fill it in for them.
  assert.match(out, /start it for you|fill it in for you/i);
  // Field tools stay forbidden this turn.
  assert.match(out, /set_field/);
  // The link is the online form, so no "ready to start" prompt.
  assert.match(out, /ready to start/i);
});

test("handoff: copy the model reproduces is free of em/en dashes", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.doesNotMatch(
    out,
    /[—–]/,
    "no em/en dashes anywhere in the disclosure",
  );
});

test("handoff: uses the reshaped lead-in + closing copy", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.match(out, /Here's the form to get started:/);
  assert.match(out, /complete your application there when you're ready/i);
});

// #1079 follow-up: we now show BOTH paths. The disclosure must no longer forbid
// the paper / in-person route, and must explicitly allow it as a fallback after
// the online link.
test("handoff: allows the in-person / paper fallback instead of forbidding it", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  // The old prohibition is gone.
  assert.doesNotMatch(out, /recite the paper-form path/i);
  // Both paths are explicitly permitted, online still leading.
  assert.match(out, /BOTH PATHS/);
  assert.match(out, /in person|in-person/i);
});
