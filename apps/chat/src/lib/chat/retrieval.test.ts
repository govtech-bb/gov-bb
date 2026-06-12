import assert from "node:assert/strict";
import { test } from "node:test";
import { SCORE_THRESHOLD } from "#/lib/rag/config";
import {
  decideRagFallback,
  isConversationalCloser,
  topHandoffCandidateSlug,
  topServiceCandidates,
} from "./retrieval";
import type { Source } from "./types";

// topHandoffCandidateSlug picks the slug of the single top-ranked retrieved
// source so run-turn can drive a form handoff from RAG when the title-token
// matcher misses (e.g. "how do I become a conductor"). Source ids are
// `service-<slug>` (ingest chunker). Sources arrive sorted by score desc.

function src(id: string, score: number): Source {
  return { id, url: `https://alpha.gov.bb/${id}`, title: id, score };
}

test("returns the slug of the top service source above the score threshold", () => {
  const sources = [
    src("service-apply-for-conductor-licence", 0.62),
    src("service-something-else", 0.5),
  ];
  assert.equal(topHandoffCandidateSlug(sources), "apply-for-conductor-licence");
});

test("returns null when the top source is below the score threshold", () => {
  assert.equal(topHandoffCandidateSlug([src("service-conductor", 0.4)]), null);
});

test("accepts a top source exactly at the score threshold", () => {
  // The cutoff is `< SCORE_THRESHOLD`, so the threshold value itself qualifies.
  assert.equal(
    topHandoffCandidateSlug([src("service-conductor", SCORE_THRESHOLD)]),
    "conductor",
  );
});

test("returns null for a service id with an empty slug", () => {
  assert.equal(topHandoffCandidateSlug([src("service-", 0.9)]), null);
});

test("ignores a non-service top source (e.g. news)", () => {
  assert.equal(topHandoffCandidateSlug([src("news-budget-2026", 0.9)]), null);
});

test("returns null for no sources", () => {
  assert.equal(topHandoffCandidateSlug([]), null);
});

test("considers only the top source, not lower-ranked ones", () => {
  // Top is below threshold; we do not scan past it to the strong second source.
  const sources = [
    src("service-weak-topic", 0.3),
    src("service-apply-for-conductor-licence", 0.8),
  ];
  assert.equal(topHandoffCandidateSlug(sources), null);
});

test("prefers the source's formId over the doc-id slug", () => {
  // The landing folder name ("apply-to-be-a-project-protege-mentor") is NOT
  // the forms-API id ("project-protege-mentor") — the frontmatter form_id
  // carried on the source is the real identity (#1265).
  const top: Source = {
    ...src("service-apply-to-be-a-project-protege-mentor", 0.7),
    formId: "project-protege-mentor",
  };
  assert.equal(topHandoffCandidateSlug([top]), "project-protege-mentor");
});

test("falls back to the doc-id slug for legacy sources without formId", () => {
  // Pre-#1265 documents have no formId in metadata until the next full
  // re-ingest; the slug fallback keeps the coincidentally-matching forms live.
  assert.equal(
    topHandoffCandidateSlug([src("service-get-birth-certificate", 0.7)]),
    "get-birth-certificate",
  );
});

// decideRagFallback — the post-matcher branch: do nothing, hand off a fresh
// form, or continue an already-handed-off form. run-turn folds the "no form
// pinned" gates into producing `candidate` (null = do nothing).

test("no candidate (matcher pinned a form, or nothing retrieved) → none", () => {
  assert.deepEqual(
    decideRagFallback({
      candidate: null,
      candidateHandoff: false,
      handedOffSlug: null,
    }),
    { action: "none" },
  );
});

test("candidate that isn't a handoff form → none (info-only / collectible)", () => {
  assert.deepEqual(
    decideRagFallback({
      candidate: "register-a-birth",
      candidateHandoff: false,
      handedOffSlug: null,
    }),
    { action: "none" },
  );
});

test("new handoff form (not the one already handed off) → fresh-handoff", () => {
  assert.deepEqual(
    decideRagFallback({
      candidate: "apply-for-conductor-licence",
      candidateHandoff: true,
      handedOffSlug: null,
    }),
    { action: "fresh-handoff" },
  );
});

test("a different handoff form after one was handed off → fresh-handoff", () => {
  assert.deepEqual(
    decideRagFallback({
      candidate: "get-death-certificate",
      candidateHandoff: true,
      handedOffSlug: "apply-for-conductor-licence",
    }),
    { action: "fresh-handoff" },
  );
});

test("same form the user was already handed off to → continuation", () => {
  assert.deepEqual(
    decideRagFallback({
      candidate: "apply-for-conductor-licence",
      candidateHandoff: true,
      handedOffSlug: "apply-for-conductor-licence",
    }),
    { action: "continuation" },
  );
});

// isConversationalCloser — content-based wrap-up detection (#1125). The second
// arg is the previous assistant message, which only matters for the ambiguous
// tier (does it gate on us having asked "anything else?").

const NO_PRIOR = "";
const ASKED_WRAP_UP = "Here's the form link. Anything else I can help with?";

test("unambiguous closers fire regardless of the prior assistant message", () => {
  for (const m of [
    "bye",
    "goodbye",
    "thanks",
    "thank you",
    "thank you, bye", // the exact #1125 bug transcript
    "thanks so much!",
    "cheers",
    "that's all",
    "thats all",
    "no thanks",
    "see you later",
    "all good",
    "ok thanks",
  ]) {
    assert.equal(isConversationalCloser(m, NO_PRIOR), true, m);
  }
});

test("more text riding on a closer word is NOT a closer", () => {
  // A question is never a closer, even when it opens with "thanks".
  assert.equal(
    isConversationalCloser("thanks, where's the office?", ASKED_WRAP_UP),
    false,
  );
  // "thanks for your help" IS a recognised sign-off, but "thanks for <arbitrary
  // noun>" is not — only the fixed gratitude tails close. Keeps the matcher from
  // swallowing "thanks for the form, now how do I pay" style turns.
  assert.equal(isConversationalCloser("thanks for your help", NO_PRIOR), true);
  assert.equal(isConversationalCloser("thanks for helping", NO_PRIOR), true);
  assert.equal(
    isConversationalCloser("thanks for the form link", NO_PRIOR),
    false,
  );
  // An ambiguous opener followed by a real question is not a closer.
  assert.equal(
    isConversationalCloser("ok but how much does it cost", ASKED_WRAP_UP),
    false,
  );
});

test("ambiguous replies are closers ONLY after we asked the wrap-up question", () => {
  for (const m of ["no", "nope", "nah", "ok", "okay", "no that's all"]) {
    assert.equal(
      isConversationalCloser(m, ASKED_WRAP_UP),
      true,
      `${m} (asked)`,
    );
    assert.equal(
      isConversationalCloser(m, NO_PRIOR),
      false,
      `${m} (not asked)`,
    );
  }
});

test("a question is never a closer, even if it ends with thanks-y words", () => {
  assert.equal(
    isConversationalCloser("is that all I need?", ASKED_WRAP_UP),
    false,
  );
  assert.equal(isConversationalCloser("", NO_PRIOR), false);
});

// ---------------------------------------------------------------------------
// topServiceCandidates — the disambiguation signal (ADR 0048 stage 3)
// ---------------------------------------------------------------------------

const svc = (slug: string, score: number, title = slug) => ({
  id: `service-${slug}`,
  url: `https://alpha.gov.bb/${slug}`,
  title,
  score,
});

test("topServiceCandidates dedupes chunks and keeps rank order", () => {
  const out = topServiceCandidates([
    svc("get-birth-certificate", 0.8, "Get a birth certificate"),
    svc("get-birth-certificate", 0.7, "Get a birth certificate"),
    svc("get-death-certificate", 0.6, "Get a death certificate"),
  ]);
  assert.deepEqual(
    out.map((c) => c.slug),
    ["get-birth-certificate", "get-death-certificate"],
  );
});

test("topServiceCandidates excludes sub-threshold and non-service docs", () => {
  const out = topServiceCandidates([
    svc("get-birth-certificate", 0.8),
    { id: "news-some-article", url: "https://x", title: "News", score: 0.9 },
    svc("get-death-certificate", 0.2),
  ]);
  assert.deepEqual(
    out.map((c) => c.slug),
    ["get-birth-certificate"],
  );
});

test("topServiceCandidates caps the list", () => {
  const out = topServiceCandidates(
    ["a", "b", "c", "d"].map((s) => svc(s, 0.8)),
    3,
  );
  assert.equal(out.length, 3);
});
