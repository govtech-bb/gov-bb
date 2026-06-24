import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAT_FORM_POLICY, formMode, isSurfaceableForm } from "./policy.ts";

test("isSurfaceableForm is true only for forms with a policy entry", () => {
  assert.equal(isSurfaceableForm("get-death-certificate"), true);
  assert.equal(isSurfaceableForm("project-protege-mentor"), true);
  assert.equal(isSurfaceableForm("some-unapproved-form"), false);
});

test("formMode returns the approved mode, or undefined when not approved", () => {
  assert.equal(formMode("get-death-certificate"), "handoff");
  assert.equal(formMode("project-protege-mentor"), "collect");
  assert.equal(formMode("chat-feedback"), "collect");
  assert.equal(formMode("some-unapproved-form"), undefined);
});

test("every policy value is a valid mode", () => {
  for (const mode of CHAT_FORM_POLICY.values()) {
    assert.ok(mode === "collect" || mode === "handoff", mode);
  }
});
