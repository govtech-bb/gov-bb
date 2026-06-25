import assert from "node:assert/strict";
import { test } from "node:test";
import type { Primitive } from "@govtech-bb/form-types";
import { canonicalizeValue, coerceValue } from "./coerce.ts";

const field = (over: Record<string, unknown>): Primitive =>
  ({
    fieldId: "f",
    label: "F",
    htmlType: "text",
    ...over,
  }) as unknown as Primitive;

const parish = field({
  htmlType: "select",
  options: [
    { label: "St. Michael", value: "st-michael" },
    { label: "Christ Church", value: "christ-church" },
  ],
});

test("date: ISO and DD/MM/YYYY → {day,month,year}; junk → error", () => {
  assert.deepEqual(coerceValue(field({ htmlType: "date" }), "2026-01-15"), {
    value: { year: "2026", month: "01", day: "15" },
  });
  assert.deepEqual(coerceValue(field({ htmlType: "date" }), "15/01/2026"), {
    value: { day: "15", month: "01", year: "2026" },
  });
  assert.ok(
    "error" in coerceValue(field({ htmlType: "date" }), "next tuesday"),
  );
});

test("number coerces; non-number errors", () => {
  assert.deepEqual(coerceValue(field({ htmlType: "number" }), "42"), {
    value: 42,
  });
  assert.ok("error" in coerceValue(field({ htmlType: "number" }), "lots"));
});

test("checkbox/show-hide booleans accept yes/no/true/false", () => {
  assert.deepEqual(coerceValue(field({ htmlType: "checkbox" }), "yes"), {
    value: true,
  });
  assert.deepEqual(coerceValue(field({ htmlType: "checkbox" }), "No"), {
    value: false,
  });
  assert.deepEqual(coerceValue(field({ htmlType: "show-hide" }), "true"), {
    value: true,
  });
  assert.ok("error" in coerceValue(field({ htmlType: "checkbox" }), "maybe"));
});

test("select maps LABEL or value → option value; unknown errors", () => {
  assert.deepEqual(coerceValue(parish, "St. Michael"), { value: "st-michael" });
  assert.deepEqual(coerceValue(parish, "christ-church"), {
    value: "christ-church",
  });
  assert.ok("error" in coerceValue(parish, "Atlantis"));
});

test("multi-select → array of matched values", () => {
  const multi = field({
    htmlType: "checkbox",
    options: [
      { label: "A", value: "a" },
      { label: "B", value: "b" },
    ],
  });
  assert.deepEqual(coerceValue(multi, "A, b"), { value: ["a", "b"] });
});

test("canonicalizeValue: show-hide→true/false, option→value, text→raw, multi→csv", () => {
  assert.equal(
    canonicalizeValue(field({ htmlType: "show-hide" }), "yes"),
    "true",
  );
  assert.equal(canonicalizeValue(parish, "St. Michael"), "st-michael");
  assert.equal(canonicalizeValue(field({}), "Jane Doe"), "Jane Doe");
});
