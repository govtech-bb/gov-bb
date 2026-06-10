import assert from "node:assert/strict";
import { test } from "node:test";
import { SURFACEABLE_FORM_IDS, isSurfaceableForm } from "./allowlist";

// The chat's approval gate. Guards against accidental edits widening or
// narrowing what the chatbot can surface. Update the expected list here (and
// the comment) deliberately when a form gets MDA approval.
const EXPECTED = [
  "get-birth-certificate",
  "get-death-certificate",
  "get-marriage-certificate",
  "project-protege-mentor",
  "sports-training-programme-form-schema",
  "jobstart-plus-programme",
  "apply-for-conductor-licence",
  "get-a-primary-school-textbook-grant",
  "post-office-redirection-individual",
  "post-office-redirection-deceased",
  "post-office-redirection-business",
  "sell-goods-services-beach-park",
  "chat-feedback",
];

test("allowlist is exactly the approved forms", () => {
  assert.equal(SURFACEABLE_FORM_IDS.size, EXPECTED.length);
  for (const id of EXPECTED) assert.ok(isSurfaceableForm(id), `missing ${id}`);
});

test("isSurfaceableForm rejects non-approved forms", () => {
  assert.equal(isSurfaceableForm("driver-licence-renewal"), false);
  assert.equal(isSurfaceableForm("national-id-application"), false);
  assert.equal(isSurfaceableForm(""), false);
});
