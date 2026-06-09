import assert from "node:assert/strict";
import { test } from "node:test";
import { SCORE_THRESHOLD } from "./rag-config";
import { topHandoffCandidateSlug } from "./retrieval";
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

test("skips a slug already handed off this thread", () => {
  const sources = [src("service-apply-for-conductor-licence", 0.7)];
  assert.equal(
    topHandoffCandidateSlug(sources, "apply-for-conductor-licence"),
    null,
  );
});

test("still returns a different slug when another was handed off", () => {
  const sources = [src("service-get-death-certificate", 0.7)];
  assert.equal(
    topHandoffCandidateSlug(sources, "apply-for-conductor-licence"),
    "get-death-certificate",
  );
});
