import assert from "node:assert/strict";
import { test } from "node:test";
import {
  newTokenizeState,
  restoreLinks,
  tokenizeLinks,
} from "./link-tokens.ts";

const LANDING = "https://landing.sandbox.alpha.gov.bb";

test("tokenizes markdown links; same URL → same token; relative → absolute", () => {
  const st = newTokenizeState();
  const out = tokenizeLinks(
    "See [passport](/travel/passport) and [again](/travel/passport) and [ext](https://x.com).",
    st,
    LANDING,
  );
  assert.match(out, /\[passport\]\(link_1\)/);
  assert.match(out, /\[again\]\(link_1\)/); // dedup to same token
  assert.match(out, /\[ext\]\(link_2\)/);
  assert.equal(st.map["link_1"], `${LANDING}/travel/passport`);
  assert.equal(st.map["link_2"], "https://x.com");
});

test("leaves mailto/tel/bare-anchor targets untouched", () => {
  const st = newTokenizeState();
  const out = tokenizeLinks("[mail](mailto:a@b.com) [a](#frag)", st, LANDING);
  assert.equal(out, "[mail](mailto:a@b.com) [a](#frag)");
  assert.equal(Object.keys(st.map).length, 0);
});

test("restoreLinks: known token → URL, unknown token → stripped", () => {
  const map = { link_1: "https://alpha.gov.bb/x" };
  assert.equal(
    restoreLinks("go to [here](link_1) now", map),
    "go to [here](https://alpha.gov.bb/x) now",
  );
  // unknown md-token link collapses to its label
  assert.equal(restoreLinks("[bad](link_9)", map), "bad");
  // bare unknown token removed
  assert.equal(restoreLinks("see link_9 ok", map), "see  ok");
});
