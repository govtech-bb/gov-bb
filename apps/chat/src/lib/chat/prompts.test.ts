import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHandoffContinuationDisclosure,
  buildHandoffDisclosure,
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

// The handoff disclosure is the first reply that hands the user the form link.
// Issue #1065: the copy must read warm and supportive, not curt, while keeping
// the strict link-first shape and every guardrail that stops the #965 drift
// (skipping the link, hallucinating inline collection, pushing the paper route).

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
