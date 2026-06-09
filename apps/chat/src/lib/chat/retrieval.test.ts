import assert from "node:assert/strict";
import { test } from "node:test";
import { SCORE_THRESHOLD } from "./rag-config";
import { decideHandoffStep, topHandoffCandidateSlug } from "./retrieval";
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

// decideHandoffStep — given a turn that has a handoff-required form target,
// choose: offer the apply options, hand over the link, or continue. The link
// and continuation only happen AFTER the options have been offered for the form
// (offeredSlug === candidateSlug); the first encounter always offers.

const CONDUCTOR = "apply-for-conductor-licence";

test("first encounter → offer (even if the message mentions online)", () => {
  assert.equal(
    decideHandoffStep({
      latest: "conductor licence",
      candidateSlug: CONDUCTOR,
      offeredSlug: null,
    }),
    "offer",
  );
  // "online" in the very first message must NOT skip the options step.
  assert.equal(
    decideHandoffStep({
      latest: "is there an online form for a conductor licence",
      candidateSlug: CONDUCTOR,
      offeredSlug: null,
    }),
    "offer",
  );
});

test("offered a different form → offer (the new form), not the old one", () => {
  assert.equal(
    decideHandoffStep({
      latest: "get a death certificate",
      candidateSlug: "get-death-certificate",
      offeredSlug: CONDUCTOR,
    }),
    "offer",
  );
});

test("after the offer, online intent → link", () => {
  assert.equal(
    decideHandoffStep({
      latest: "Apply online",
      candidateSlug: CONDUCTOR,
      offeredSlug: CONDUCTOR,
    }),
    "link",
  );
  assert.equal(
    decideHandoffStep({
      latest: "I'd like to apply online please",
      candidateSlug: CONDUCTOR,
      offeredSlug: CONDUCTOR,
    }),
    "link",
  );
});

test("after the offer, paper choice → continuation (even if 'online' appears)", () => {
  assert.equal(
    decideHandoffStep({
      latest: "Get a paper form",
      candidateSlug: CONDUCTOR,
      offeredSlug: CONDUCTOR,
    }),
    "continuation",
  );
  // paper preference wins over a bare "online" mention
  assert.equal(
    decideHandoffStep({
      latest: "I can't apply online, can I get a paper form",
      candidateSlug: CONDUCTOR,
      offeredSlug: CONDUCTOR,
    }),
    "continuation",
  );
});

test("after the offer, ambiguous follow-up → continuation", () => {
  assert.equal(
    decideHandoffStep({
      latest: "what documents do I need",
      candidateSlug: CONDUCTOR,
      offeredSlug: CONDUCTOR,
    }),
    "continuation",
  );
});
