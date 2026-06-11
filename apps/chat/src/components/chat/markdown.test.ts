import assert from "node:assert/strict";
import { test } from "node:test";
import type { Citation } from "#/lib/chat/types";
import { annotateCitations } from "./markdown";

const CITES: Citation[] = [
  { number: "1", url: "https://alpha.gov.bb/a", title: "Birth certificate" },
  { number: "2", url: "https://alpha.gov.bb/b", title: "Registration Dept" },
];

test("a single marker becomes one chip link", () => {
  assert.equal(
    annotateCitations("It costs $5 BBD [1].", CITES),
    "It costs $5 BBD [​](#citation-1).",
  );
});

// Claude.ai style: a run of consecutive markers collapses into ONE grouped
// chip instead of a chip per marker interrupting the prose.
test("consecutive markers collapse into one grouped chip", () => {
  assert.equal(
    annotateCitations("Takes 5-7 days [1][2].", CITES),
    "Takes 5-7 days [​](#citation-1,2).",
  );
  assert.equal(
    annotateCitations("Takes 5-7 days [1] [2].", CITES),
    "Takes 5-7 days [​](#citation-1,2).",
  );
  // Repeats dedupe.
  assert.equal(
    annotateCitations("Fee is $5 [1][1].", CITES),
    "Fee is $5 [​](#citation-1).",
  );
});

test("unknown numbers and citation-free text pass through untouched", () => {
  assert.equal(annotateCitations("See [9].", CITES), "See [9].");
  assert.equal(
    annotateCitations("No markers here.", CITES),
    "No markers here.",
  );
  assert.equal(
    annotateCitations("Array access a[0] stays.", []),
    "Array access a[0] stays.",
  );
});
