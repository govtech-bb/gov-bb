import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FORM_COLLECTION_PROTOCOL,
  SYSTEM_PROMPT,
  buildHandoffContinuationDisclosure,
  buildHandoffOfferDisclosure,
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
