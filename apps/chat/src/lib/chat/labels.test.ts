import assert from "node:assert/strict";
import { test } from "node:test";
import { humanise } from "./labels.ts";

test("replaces hyphens and underscores with spaces", () => {
  assert.equal(humanise("first-name"), "First name");
  assert.equal(humanise("date_of_birth"), "Date of birth");
});

test("collapses runs of separators to a single space", () => {
  assert.equal(humanise("a--b__c"), "A b c");
});

test("capitalises the first character", () => {
  assert.equal(humanise("email"), "Email");
});

test("trims surrounding separators", () => {
  assert.equal(humanise("-name-"), "Name");
});

test("returns an empty string unchanged", () => {
  assert.equal(humanise(""), "");
});
