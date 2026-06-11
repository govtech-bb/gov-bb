import assert from "node:assert/strict";
import { test } from "node:test";
import { isRequiredField } from "./required";

// Two recipe styles for "optional" must BOTH read as optional — the engine
// treats `required: { value: false }` as not required, and the chat must
// agree or the Skip button never renders (the address-line-2 bug).
test("isRequiredField mirrors the shared engine's semantics", () => {
  // Required: rule present, value true or omitted.
  assert.equal(
    isRequiredField({ required: { value: true, error: "x" } }),
    true,
  );
  assert.equal(isRequiredField({ required: {} }), true);
  // Optional: rule absent (middle names) OR value:false (address line 2).
  assert.equal(isRequiredField({ required: { value: false } }), false);
  assert.equal(isRequiredField({}), false);
  assert.equal(isRequiredField(undefined), false);
  assert.equal(isRequiredField(null), false);
});
