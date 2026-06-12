import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAT_FORM_POLICY,
  HANDOFF_ALL_FORMS,
  isForcedHandoff,
  isSurfaceableForm,
} from "./policy";

// The chat's approval gate. Guards against accidental edits widening or
// narrowing what the chatbot can surface. Update deliberately when a form
// gets MDA approval (the PR review is the audit trail).
const EXPECTED: Record<string, "collect" | "handoff"> = {
  "get-birth-certificate": "handoff",
  "get-death-certificate": "handoff",
  "get-marriage-certificate": "handoff",
  "apply-for-conductor-licence": "handoff",
  "sell-goods-services-beach-park": "handoff",
  "get-a-primary-school-textbook-grant": "handoff",
  "project-protege-mentor": "collect",
  "sports-training-programme-form-schema": "collect",
  "jobstart-plus-programme": "collect",
  "post-office-redirection-individual": "collect",
  "post-office-redirection-deceased": "collect",
  "post-office-redirection-business": "collect",
  "chat-feedback": "collect",
};

test("policy is exactly the approved forms with their modes", () => {
  assert.equal(CHAT_FORM_POLICY.size, Object.keys(EXPECTED).length);
  for (const [id, mode] of Object.entries(EXPECTED)) {
    assert.equal(CHAT_FORM_POLICY.get(id), mode, id);
  }
});

test("non-approved forms are neither surfaceable nor handoff-forced", () => {
  for (const id of [
    "school-uniform-grant-barbados",
    "smart-stream-vendor-registration",
    "duties-performed-exam-claim",
    "textbook-grant-application",
    "",
  ]) {
    assert.equal(isSurfaceableForm(id), false, id);
    assert.equal(isForcedHandoff(id), false, id);
  }
});

// The release gate (HANDOFF_ALL_FORMS, #1273): while parked, every surfaceable
// gov form is forced to handoff regardless of its map mode; chat-feedback is
// the sole exemption (#1272). This assertion tracks the flag, so flipping it
// back to re-enable collection keeps the test green without an edit here.
test("isForcedHandoff respects the release gate, chat-feedback exempt", () => {
  assert.equal(isSurfaceableForm("post-office-redirection-individual"), true);
  for (const [id, mode] of Object.entries(EXPECTED)) {
    const expected =
      id === "chat-feedback"
        ? false
        : HANDOFF_ALL_FORMS
          ? true
          : mode === "handoff";
    assert.equal(isForcedHandoff(id), expected, id);
  }
});
