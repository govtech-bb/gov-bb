import assert from "node:assert/strict";
import { test } from "node:test";
import type { RetrievedContext, Source } from "#/lib/rag/types";
import {
  buildCitedContext,
  buildSystemPrompts,
  isConversationalCloser,
  isGreetingOrTooShort,
} from "./grounding.ts";

const LANDING = "https://landing.sandbox.alpha.gov.bb";

const ctx = (over: Partial<RetrievedContext> = {}): RetrievedContext => ({
  title: "Renew your passport",
  section: "Eligibility",
  text: "You must be a citizen.",
  ...over,
});
const src = (over: Partial<Source> = {}): Source => ({
  id: "service-renew-passport",
  url: "https://alpha.gov.bb/passport",
  title: "Renew your passport",
  section: "Eligibility",
  score: 0.8,
  excerpt: "You must be a citizen of Barbados to renew.",
  ...over,
});

test("isGreetingOrTooShort", () => {
  for (const g of ["hi", "Hello", "hey!", "good morning", "a", ""]) {
    assert.equal(isGreetingOrTooShort(g), true, g);
  }
  assert.equal(isGreetingOrTooShort("how do I renew my passport"), false);
});

test("isConversationalCloser: farewells/thanks are closers; questions + bare-no-without-wrapup are not", () => {
  for (const c of [
    "thanks, bye",
    "that's all, thank you!",
    "take care",
    "ok, thanks for your help",
    "no thanks",
  ]) {
    assert.equal(isConversationalCloser(c, ""), true, c);
  }
  assert.equal(
    isConversationalCloser("thanks, where's the office?", ""),
    false,
  );
  assert.equal(isConversationalCloser("how do I renew my passport", ""), false);
  // bare "no" is a closer only after a wrap-up question
  assert.equal(
    isConversationalCloser("no", "do you need anything else?"),
    true,
  );
  assert.equal(isConversationalCloser("no", "you need two photos"), false);
});

test("builds a numbered, cited block above threshold", () => {
  const r = buildCitedContext([ctx()], [src()], LANDING);
  assert.equal(r.citations.length, 1);
  assert.match(r.block, /^\[1\] Renew your passport — Eligibility\n/);
  assert.equal(r.citations[0].number, "1");
  assert.match(r.citations[0].url, /#:~:text=/); // text-fragment deep link
});

test("includes the formId in the block only when includeFormIds is set", () => {
  const withForm = src({ formId: "project-protege-mentor" });
  assert.doesNotMatch(
    buildCitedContext([ctx()], [withForm], LANDING).block,
    /\[form:/,
  );
  assert.match(
    buildCitedContext([ctx()], [withForm], LANDING, true).block,
    /\[form: project-protege-mentor\]/,
  );
});

test("filters sources below SCORE_THRESHOLD → abstain", () => {
  const r = buildCitedContext([ctx()], [src({ score: 0.3 })], LANDING);
  assert.equal(r.citations.length, 0);
  assert.equal(r.block, "(no relevant context found)");
});

test("dedupes the same url+section", () => {
  const r = buildCitedContext([ctx(), ctx()], [src(), src()], LANDING);
  assert.equal(r.citations.length, 1);
});

test("empty contexts → EMPTY_CONTEXT", () => {
  const r = buildCitedContext([], [], LANDING);
  assert.equal(r.citations.length, 0);
  assert.equal(r.block, "(no relevant context found)");
});

test("tokenizes links in chunk text (model never sees raw URLs)", () => {
  const r = buildCitedContext(
    [ctx({ text: "Apply via [the portal](/travel/passport)." })],
    [src()],
    LANDING,
  );
  assert.match(r.block, /\(link_1\)/);
  assert.doesNotMatch(r.block, /\/travel\/passport\)/);
  assert.equal(r.linkTokens["link_1"], `${LANDING}/travel/passport`);
});

test("buildSystemPrompts: grounded includes block; abstain otherwise", () => {
  const grounded = buildSystemPrompts(
    buildCitedContext([ctx()], [src()], LANDING),
  );
  assert.equal(grounded.length, 2);
  assert.match(grounded[1], /Sources:/);
  assert.match(grounded[1], /\[1\] Renew your passport/);

  const abstain = buildSystemPrompts(buildCitedContext([], [], LANDING));
  assert.equal(abstain.length, 2);
  assert.match(abstain[1], /can't find/i);
});
