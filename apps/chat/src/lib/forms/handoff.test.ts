import assert from "node:assert/strict";
import { test } from "node:test";
import type { Source } from "#/lib/rag/types";
import { selectHandoff } from "./handoff.ts";

const LANDING = "https://landing.sandbox.alpha.gov.bb";
const src = (over: Partial<Source> = {}): Source => ({
  id: "service-get-death-certificate",
  url: `${LANDING}/family-birth-relationships/get-death-certificate`,
  title: "Get a copy of a death certificate",
  score: 0.8,
  formId: "get-death-certificate",
  hasStartPage: true,
  ...over,
});

test("returns a start-page deep link for the top eligible source", () => {
  const h = selectHandoff([src()]);
  assert.equal(h?.formId, "get-death-certificate");
  assert.equal(h?.title, "Get a copy of a death certificate");
  assert.equal(
    h?.startUrl,
    `${LANDING}/family-birth-relationships/get-death-certificate/start`,
  );
});

test("strips a trailing slash before appending /start", () => {
  const h = selectHandoff([src({ url: `${LANDING}/passport/` })]);
  assert.equal(h?.startUrl, `${LANDING}/passport/start`);
});

test("skips sources below the citation threshold", () => {
  assert.equal(selectHandoff([src({ score: 0.1 })]), null);
});

test("skips a form that isn't chat-approved", () => {
  assert.equal(selectHandoff([src({ formId: "not-approved-form" })]), null);
});

test("skips a service with no start page", () => {
  assert.equal(selectHandoff([src({ hasStartPage: undefined })]), null);
});

test("picks the highest-scoring eligible source, skipping ineligible higher ones", () => {
  const h = selectHandoff([
    src({ score: 0.9, formId: "not-approved-form" }), // top, but unapproved
    src({
      score: 0.7,
      id: "service-project-protege-mentor",
      url: `${LANDING}/youth/project-protege-mentor`,
      title: "Project Protégé Mentor",
      formId: "project-protege-mentor",
    }),
  ]);
  assert.equal(h?.formId, "project-protege-mentor");
});

test("null when there are no sources", () => {
  assert.equal(selectHandoff([]), null);
});
