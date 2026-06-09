import assert from "node:assert/strict";
import { test } from "node:test";
import { getOrCreateSession, resetSessionForNewForm } from "./session";

test("new session starts with applyOptionsOfferedFor null", () => {
  const s = getOrCreateSession("t-new-offered");
  assert.equal(s.applyOptionsOfferedFor, null);
});

test("resetSessionForNewForm clears applyOptionsOfferedFor", () => {
  const s = getOrCreateSession("t-reset-offered");
  s.applyOptionsOfferedFor = "apply-for-conductor-licence";
  resetSessionForNewForm(s);
  assert.equal(s.applyOptionsOfferedFor, null);
});
