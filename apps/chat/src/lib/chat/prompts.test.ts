import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildApplyOptionsDisclosure,
  buildHandoffContinuationDisclosure,
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

// The apply-options disclosure is the first-turn step: present the ways to
// apply as choices, withhold the link, and never collect.
test("apply-options disclosure presents choices, withholds link, no collect", () => {
  const out = buildApplyOptionsDisclosure(TITLE);
  assert.match(out, /present_choices/);
  assert.match(out, /do not (give|provide|share)[^.]*link/i);
  assert.match(out, /set_field/);
  assert.match(out, /Apply for a Conductor Licence/);
});
