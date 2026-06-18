import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlySection, rowsToResult, type RetrieveRow } from "./retrieve.ts";

const LANDING = "https://landing.sandbox.alpha.gov.bb";

const row = (over: Partial<RetrieveRow> = {}): RetrieveRow => ({
  document_id: "doc-passport",
  doc_kind: "service",
  title: "Renew your passport",
  url: "https://alpha.gov.bb/passport",
  source_url: null,
  form_id: null,
  has_start_page: null,
  chunk_kind: "section",
  chunk_text: "x".repeat(200),
  payload: { heading: "Eligibility" },
  sim: 0.8,
  ...over,
});

test("friendlySection: section uses its heading, intent has none", () => {
  assert.equal(
    friendlySection({ chunk_kind: "section", payload: { heading: "Fees" } }),
    "Fees",
  );
  assert.equal(
    friendlySection({ chunk_kind: "section", payload: null }),
    undefined,
  );
  assert.equal(
    friendlySection({ chunk_kind: "intent", payload: null }),
    undefined,
  );
});

test("rowsToResult sorts by similarity desc and caps at topK", () => {
  const rows = [
    row({ document_id: "a", sim: 0.3 }),
    row({ document_id: "b", sim: 0.9 }),
    row({ document_id: "c", sim: 0.6 }),
  ];
  const { sources } = rowsToResult(rows, LANDING, 2);
  assert.deepEqual(
    sources.map((s) => s.id),
    ["b", "c"],
  );
});

test("rowsToResult coerces string sims (pg numeric comes back as text)", () => {
  const rows = [
    row({ document_id: "a", sim: "0.4" }),
    row({ document_id: "b", sim: "0.95" }),
  ];
  const { sources } = rowsToResult(rows, LANDING);
  assert.equal(sources[0].id, "b");
  assert.equal(sources[0].score, 0.95);
});

test("rowsToResult rewrites host, truncates excerpt, omits absent formId", () => {
  const { contexts, sources } = rowsToResult([row()], LANDING);
  assert.equal(sources[0].url, "https://landing.sandbox.alpha.gov.bb/passport");
  assert.equal(sources[0].excerpt?.length, 160);
  assert.equal(sources[0].section, "Eligibility");
  assert.equal("formId" in sources[0], false);
  assert.equal(contexts[0].title, "Renew your passport");
});

test("rowsToResult passes through formId when present", () => {
  const { sources } = rowsToResult(
    [row({ form_id: "PASSPORT_RENEWAL" })],
    LANDING,
  );
  assert.equal(sources[0].formId, "PASSPORT_RENEWAL");
});

test("rowsToResult flags hasStartPage from the jsonb 'true' text, omits it otherwise", () => {
  const yes = rowsToResult([row({ has_start_page: "true" })], LANDING);
  assert.equal(yes.sources[0].hasStartPage, true);
  const no = rowsToResult([row({ has_start_page: null })], LANDING);
  assert.equal("hasStartPage" in no.sources[0], false);
});

test("rowsToResult returns empty contexts + sources for no rows", () => {
  const { contexts, sources } = rowsToResult([], LANDING);
  assert.deepEqual(contexts, []);
  assert.deepEqual(sources, []);
});

test("rowsToResult: an intent chunk has no section label", () => {
  const { contexts, sources } = rowsToResult(
    [row({ chunk_kind: "intent", payload: null })],
    LANDING,
  );
  assert.equal(contexts[0].section, undefined);
  assert.equal(sources[0].section, undefined);
});

test("rowsToResult excerpt is the full text when shorter than 160", () => {
  const { sources } = rowsToResult([row({ chunk_text: "short" })], LANDING);
  assert.equal(sources[0].excerpt, "short");
});

test("rowsToResult keeps contexts and sources aligned and ordered", () => {
  const rows = [
    row({ document_id: "a", title: "A", sim: 0.4 }),
    row({ document_id: "b", title: "B", sim: 0.9 }),
    row({ document_id: "c", title: "C", sim: 0.6 }),
  ];
  const { contexts, sources } = rowsToResult(rows, LANDING);
  assert.deepEqual(
    contexts.map((c) => c.title),
    ["B", "C", "A"],
  );
  assert.deepEqual(
    sources.map((s) => s.title),
    ["B", "C", "A"],
  );
});
