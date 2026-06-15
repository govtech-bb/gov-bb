import assert from "node:assert/strict";
import { test } from "node:test";
import { newTokenizeState, restoreLinks, tokenizeLinks } from "./link-tokens";

const LANDING = "https://landing.sandbox.alpha.gov.bb";

// Tokenisation (#1270): the model must never see a raw URL in chunk text —
// markdown link targets become opaque link_N tokens; the map restores them.

test("tokenizes absolute and relative markdown links, resolving relative", () => {
  const state = newTokenizeState();
  const out = tokenizeLinks(
    "See [business mail](/travel-id-citizenship/post-office-redirection-business) or [gov.bb](https://www.gov.bb/page).",
    state,
    LANDING,
  );
  assert.equal(out, "See [business mail](link_1) or [gov.bb](link_2).");
  assert.equal(
    state.map.link_1,
    `${LANDING}/travel-id-citizenship/post-office-redirection-business`,
  );
  assert.equal(state.map.link_2, "https://www.gov.bb/page");
});

test("same URL gets the same token across calls sharing state", () => {
  const state = newTokenizeState();
  const a = tokenizeLinks("[x](/same/path)", state, LANDING);
  const b = tokenizeLinks("[y](/same/path)", state, LANDING);
  assert.equal(a, "[x](link_1)");
  assert.equal(b, "[y](link_1)");
  assert.equal(Object.keys(state.map).length, 1);
});

test("leaves mailto, tel, and anchors alone", () => {
  const state = newTokenizeState();
  const text =
    "[email](mailto:x@gov.bb) [call](tel:+1246) [section](#eligibility)";
  assert.equal(tokenizeLinks(text, state, LANDING), text);
  assert.equal(Object.keys(state.map).length, 0);
});

// Restoration: known tokens become real links; unknown (hallucinated) tokens
// must never render as anything.

test("restores known tokens in markdown shape and bare", () => {
  const map = { link_1: `${LANDING}/cat/svc` };
  assert.equal(
    restoreLinks("Apply at [the service](link_1).", map),
    `Apply at [the service](${LANDING}/cat/svc).`,
  );
  assert.equal(
    restoreLinks("Apply at link_1 today.", map),
    `Apply at ${LANDING}/cat/svc today.`,
  );
});

test("strips unknown tokens; markdown-shaped unknown collapses to its label", () => {
  assert.equal(
    restoreLinks("Apply at [the form](link_9).", {}),
    "Apply at the form.",
  );
  assert.equal(restoreLinks("Apply at link_9 now.", {}), "Apply at  now.");
});

test("plain prose containing the word link is untouched", () => {
  const map = { link_1: "https://x" };
  assert.equal(
    restoreLinks("Here is the link you wanted.", map),
    "Here is the link you wanted.",
  );
});
