import assert from "node:assert/strict";
import { test } from "node:test";
import type { Primitive } from "@govtech-bb/form-types";
import { validateValue } from "./validate.ts";

const field = (validations: Record<string, unknown>): Primitive =>
  ({
    fieldId: "f",
    label: "F",
    htmlType: "text",
    validations,
  }) as unknown as Primitive;

test("a required field rejects an empty value", () => {
  const r = validateValue(field({ required: {} }), "");
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test("a required field accepts a non-empty value", () => {
  assert.deepEqual(validateValue(field({ required: {} }), "Jane"), {
    ok: true,
    errors: [],
  });
});

test("minLength rejects a too-short value", () => {
  const r = validateValue(field({ minLength: { value: 5 } }), "Jo");
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test("minLength accepts a long-enough value", () => {
  assert.equal(
    validateValue(field({ minLength: { value: 2 } }), "Jane").ok,
    true,
  );
});

test("no validations → always ok", () => {
  assert.deepEqual(validateValue(field({}), "anything"), {
    ok: true,
    errors: [],
  });
});
