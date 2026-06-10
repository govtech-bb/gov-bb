import assert from "node:assert/strict";
import { test } from "node:test";
import { SCORE_THRESHOLD } from "#/lib/rag/config";
import { decideRagFallback, topHandoffCandidateSlug } from "./retrieval";
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
