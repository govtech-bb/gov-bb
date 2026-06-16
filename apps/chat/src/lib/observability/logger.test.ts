import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { logger, redactString } from "./logger.ts";

let lines: string[];
let origLog: typeof console.log;
let origEnv: string | undefined;

beforeEach(() => {
  lines = [];
  origLog = console.log;
  origEnv = process.env.NODE_ENV;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
});

afterEach(() => {
  console.log = origLog;
  if (origEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = origEnv;
});

test("prod emits one JSON line with level, ts, event and fields", () => {
  process.env.NODE_ENV = "production";
  logger.info("chat.turn", { model: "claude-haiku-4-5", totalTokens: 42 });
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.level, "info");
  assert.equal(rec.event, "chat.turn");
  assert.equal(rec.model, "claude-haiku-4-5");
  assert.equal(rec.totalTokens, 42);
  assert.equal(typeof rec.ts, "string");
});

test("dev emits a readable line, not JSON", () => {
  process.env.NODE_ENV = "development";
  logger.info("chat.turn", { model: "m" });
  assert.match(lines[0], /^\[info\] chat\.turn/);
});

test("redacts connection strings, AWS keys, and bearer-like tokens", () => {
  assert.match(
    redactString("db at postgres://user:secretpw@host:5432/db now"),
    /\[REDACTED\]/,
  );
  assert.doesNotMatch(
    redactString("postgres://user:secretpw@host/db"),
    /secretpw/,
  );
  assert.match(redactString("AKIAABCDEFGHIJKLMNOP"), /\[REDACTED\]/);
  assert.match(redactString("token_abcdefghijklmnop1234"), /\[REDACTED\]/);
});

test("redacts long base64 blobs and 40-char values followed by a secret keyword", () => {
  assert.match(redactString("x".repeat(80)), /\[REDACTED\]/);
  // The 40-char pattern uses a lookahead — the keyword must follow the value.
  // The literal is built from two halves so push-protection doesn't read the
  // fixture as a real key; the runtime string is still a contiguous 40 chars.
  assert.match(
    redactString(
      "abcdefghijklmnopqrstuvwxyz" + "0123456789ABCD" + " is the token",
    ),
    /\[REDACTED\]/,
  );
});

test("prod log redacts a secret hiding in a field value", () => {
  process.env.NODE_ENV = "production";
  logger.info("x", { dsn: "postgres://u:p@h/db" });
  assert.doesNotMatch(lines[0], /:p@/);
  assert.match(lines[0], /\[REDACTED\]/);
});

test("prod log redacts a secret NESTED inside a structured field", () => {
  process.env.NODE_ENV = "production";
  logger.error("chat.unhandled", {
    err: { message: "connect postgres://u:hunter2@h:5432/db failed" },
  });
  assert.doesNotMatch(lines[0], /hunter2/);
  assert.match(lines[0], /\[REDACTED\]/);
});
