import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMarkdown } from "./normalize-markdown";

// The SYSTEM_PROMPT bans em/en dashes, but that's a soft instruction the model
// doesn't always obey (#1079 follow-up). normalizeMarkdown runs on every render
// (bubble.tsx), so stripping dashes here guarantees they never reach the user,
// regardless of what the model emits.
test("replaces a spaced em dash with a comma", () => {
  assert.equal(
    normalizeMarkdown("Have the details handy — you can also use paper."),
    "Have the details handy, you can also use paper.",
  );
});

test("replaces an en dash too", () => {
  assert.equal(normalizeMarkdown("Open 8am – 4pm."), "Open 8am, 4pm.");
});

test("strips a dash with no surrounding spaces", () => {
  assert.equal(normalizeMarkdown("self—employed"), "self, employed");
});

test("leaves ordinary hyphens in compound words alone", () => {
  assert.equal(
    normalizeMarkdown("You can be self-employed."),
    "You can be self-employed.",
  );
});

test("strips dashes inside bullets and headings", () => {
  const out = normalizeMarkdown("- Apply online — it's quickest");
  assert.ok(!/[—–]/.test(out), "no em/en dash should survive");
  assert.equal(out, "- Apply online, it's quickest");
});

test("empty input is unchanged", () => {
  assert.equal(normalizeMarkdown(""), "");
});
