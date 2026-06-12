import assert from "node:assert/strict";
import { test } from "node:test";
import { startPathFromDoc } from "./start-page";

// The handoff start path is derived from the RAG document's canonical url +
// its hasStartPage flag — no hand-maintained form→URL map (#1273 supersedes
// the hardcoded startPage map approach).

test("appends /start when the service has a start page", () => {
  assert.equal(
    startPathFromDoc(
      "https://alpha.gov.bb/travel-id-citizenship/post-office-redirection-individual",
      true,
    ),
    "/travel-id-citizenship/post-office-redirection-individual/start",
  );
});

test("plain service path when there is no start page", () => {
  assert.equal(
    startPathFromDoc(
      "https://alpha.gov.bb/work-employment/some-service",
      false,
    ),
    "/work-employment/some-service",
  );
});

test("tolerates trailing slashes and rejects junk", () => {
  assert.equal(
    startPathFromDoc("https://alpha.gov.bb/cat/svc/", true),
    "/cat/svc/start",
  );
  assert.equal(startPathFromDoc("https://alpha.gov.bb/", true), null);
  assert.equal(startPathFromDoc("not a url", true), null);
});
