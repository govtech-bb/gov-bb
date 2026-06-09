import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHandoffContinuationDisclosure,
  buildHandoffOfferDisclosure,
} from "./prompts";

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
