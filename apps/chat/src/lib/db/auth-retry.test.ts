import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthFailure } from "./index.ts";

// Mirrors drizzle-orm 0.45.2 DrizzleQueryError: a wrapper Error whose `.cause`
// is the original node-postgres error carrying SQLSTATE `.code`.
function drizzleWrapped(code: string): Error {
  const pgErr = Object.assign(new Error("password authentication failed"), {
    code,
  });
  return Object.assign(new Error("Failed query: select 1\nparams: "), {
    cause: pgErr,
  });
}

test("detects 28P01 on a bare pg error (err.code)", () => {
  assert.equal(
    isAuthFailure(Object.assign(new Error("x"), { code: "28P01" })),
    true,
  );
});

test("detects 28P01 wrapped by drizzle (err.cause.code)", () => {
  assert.equal(isAuthFailure(drizzleWrapped("28P01")), true);
});

test("returns false for a non-auth pg error (e.g. 57014 statement_timeout)", () => {
  assert.equal(isAuthFailure(drizzleWrapped("57014")), false);
});

test("returns false for null / undefined / plain errors", () => {
  assert.equal(isAuthFailure(null), false);
  assert.equal(isAuthFailure(undefined), false);
  assert.equal(isAuthFailure(new Error("boom")), false);
});
