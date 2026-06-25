import assert from "node:assert/strict";
import { test } from "node:test";
import { rewriteLandingHost } from "./landing-host.ts";

const LANDING = "https://landing.sandbox.alpha.gov.bb";

test("rewrites a canonical alpha.gov.bb URL to the viewer's landing origin", () => {
  assert.equal(
    rewriteLandingHost("https://alpha.gov.bb/passport?x=1#frag", LANDING),
    "https://landing.sandbox.alpha.gov.bb/passport?x=1#frag",
  );
  assert.equal(
    rewriteLandingHost("https://www.alpha.gov.bb/services/tax", LANDING),
    "https://landing.sandbox.alpha.gov.bb/services/tax",
  );
});

test("leaves non-landing hosts untouched", () => {
  const ext = "https://example.com/foo";
  assert.equal(rewriteLandingHost(ext, LANDING), ext);
});

test("returns the input unchanged when it isn't a valid URL", () => {
  assert.equal(rewriteLandingHost("/relative/path", LANDING), "/relative/path");
});
