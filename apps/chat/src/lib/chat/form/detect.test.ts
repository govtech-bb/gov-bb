import assert from "node:assert/strict";
import { test } from "node:test";
import { matchFormCandidatesFromIndex } from "./detect";
import type { FormIndexEntry } from "./defs";
import { TITLE_STOP, tokenize } from "./tokenize";

// Build an index entry the way defs.ts does — title tokenized with TITLE_STOP —
// so the test exercises the real token overlap, not a hand-rolled set.
const entry = (formId: string, title: string): FormIndexEntry => ({
  formId,
  title,
  titleToks: tokenize(title, TITLE_STOP),
});

// The three mail-redirection variants from issue #1296: "redirect mail" tokens
// overlap all three titles equally, so none should win outright.
const MAIL_INDEX = [
  entry("redirect-personal-mail", "Redirect personal mail"),
  entry("redirect-mail-individual", "Redirect mail for an individual"),
  entry("redirect-mail-deceased", "Redirect mail for a deceased person"),
];

test("exact tie surfaces every tied form as a candidate", () => {
  const out = matchFormCandidatesFromIndex("redirect mail", MAIL_INDEX);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((e) => e.formId).sort(), [
    "redirect-mail-deceased",
    "redirect-mail-individual",
    "redirect-personal-mail",
  ]);
});

test("a clear winner (margin > 1) pins outright — single candidate", () => {
  // "redirect personal mail" overlaps the personal form on all three tokens
  // (score 3) but the others on only two (redirect, mail) → the rivals sit 1
  // below... still within margin. Use a phrase that pulls the winner 2 clear:
  const index = [
    entry("get-passport", "Get a passport"),
    entry(
      "renew-passport-overseas",
      "Renew passport overseas while abroad living",
    ),
  ];
  // "renew passport overseas abroad" → renew? (stop? no) tokens: renew, passport,
  // overseas, abroad → second form scores 4, first scores 1 (passport) which is
  // below MIN_SCORE, so first isn't even a candidate.
  const out = matchFormCandidatesFromIndex(
    "renew passport overseas while abroad",
    index,
  );
  assert.deepEqual(
    out.map((e) => e.formId),
    ["renew-passport-overseas"],
  );
});

test("a near-tie within 1 point keeps the rival as a candidate", () => {
  const index = [
    entry("redirect-personal-mail", "Redirect personal mail"),
    entry("redirect-mail-individual", "Redirect mail for an individual"),
  ];
  // "redirect personal mail" → personal form scores 3 (redirect, personal,
  // mail), individual form scores 2 (redirect, mail) → within 1, both surface.
  const out = matchFormCandidatesFromIndex("redirect personal mail", index);
  assert.equal(out.length, 2);
  assert.equal(out[0].formId, "redirect-personal-mail"); // higher score leads
});

test("below MIN_SCORE yields no candidates", () => {
  // Only "mail" overlaps (one token) → below the 2-token floor.
  const out = matchFormCandidatesFromIndex("mail", MAIL_INDEX);
  assert.deepEqual(out, []);
});

test("empty / stopword-only text yields no candidates", () => {
  assert.deepEqual(matchFormCandidatesFromIndex("", MAIL_INDEX), []);
  assert.deepEqual(matchFormCandidatesFromIndex("i want to", MAIL_INDEX), []);
});

test("candidate list is capped (default 3)", () => {
  const index = [
    entry("redirect-personal-mail", "Redirect personal mail"),
    entry("redirect-mail-individual", "Redirect mail for an individual"),
    entry("redirect-mail-deceased", "Redirect mail for a deceased person"),
    entry("redirect-mail-business", "Redirect mail for a business"),
  ];
  const out = matchFormCandidatesFromIndex("redirect mail", index);
  assert.equal(out.length, 3);
});

test("single best (candidates[0]) keeps the shortest-formId tie-break", () => {
  // Two forms tie on score; the shorter formId leads, matching the historical
  // winner-take-all tie-break that matchFormsFromText relies on.
  const index = [
    entry("redirect-mail-for-an-individual-person", "Redirect mail individual"),
    entry("redirect-mail", "Redirect mail business"),
  ];
  const out = matchFormCandidatesFromIndex("redirect mail", index);
  assert.equal(out[0].formId, "redirect-mail");
});
