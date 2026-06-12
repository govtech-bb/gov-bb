import assert from "node:assert/strict";
import { test } from "node:test";
import { rewriteLandingHost } from "./landing-host";

const SANDBOX = "https://landing.sandbox.alpha.gov.bb";

test("rewrites canonical prod urls to the environment's landing origin", () => {
  assert.equal(
    rewriteLandingHost(
      "https://alpha.gov.bb/travel-id-citizenship/post-office-redirection-individual",
      SANDBOX,
    ),
    `${SANDBOX}/travel-id-citizenship/post-office-redirection-individual`,
  );
  assert.equal(
    rewriteLandingHost("https://www.alpha.gov.bb/feedback?x=1#frag", SANDBOX),
    `${SANDBOX}/feedback?x=1#frag`,
  );
});

test("is the identity when LANDING_URL is the canonical origin (prod)", () => {
  assert.equal(
    rewriteLandingHost(
      "https://alpha.gov.bb/business-trade/sell-goods-services-beach-park",
      "https://alpha.gov.bb",
    ),
    "https://alpha.gov.bb/business-trade/sell-goods-services-beach-park",
  );
});

test("leaves non-landing and unparseable urls alone", () => {
  // External source pages (legacy gov.bb) must keep their real host.
  assert.equal(
    rewriteLandingHost("https://www.gov.bb/some-ministry-page", SANDBOX),
    "https://www.gov.bb/some-ministry-page",
  );
  assert.equal(rewriteLandingHost("not a url", SANDBOX), "not a url");
});
