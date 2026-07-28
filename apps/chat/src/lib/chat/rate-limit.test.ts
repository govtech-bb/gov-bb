import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  __resetRateLimitForTest,
  checkRateLimit,
  getClientIp,
} from "./rate-limit.ts";

afterEach(() => __resetRateLimitForTest());

test("allows requests up to the limit, then blocks", () => {
  const ip = "1.1.1.1";
  const now = 1_000_000;
  for (let i = 1; i <= 3; i++) {
    assert.equal(checkRateLimit(ip, 3, now).limited, false, `request ${i}`);
  }
  const over = checkRateLimit(ip, 3, now);
  assert.equal(over.limited, true);
  assert.equal(over.remaining, 0);
  assert.ok(over.retryAfterSec >= 1);
});

test("reports remaining requests while under the limit", () => {
  const first = checkRateLimit("2.2.2.2", 5, 2_000_000);
  assert.equal(first.limited, false);
  assert.equal(first.remaining, 4);
});

test("resets after the window elapses", () => {
  const ip = "3.3.3.3";
  const start = 3_000_000;
  checkRateLimit(ip, 1, start);
  assert.equal(checkRateLimit(ip, 1, start).limited, true);
  // A request in the next window starts a fresh count.
  assert.equal(checkRateLimit(ip, 1, start + 61_000).limited, false);
});

test("tracks each IP independently", () => {
  const now = 4_000_000;
  assert.equal(checkRateLimit("a", 1, now).limited, false);
  assert.equal(checkRateLimit("a", 1, now).limited, true);
  // A different IP has its own untouched bucket.
  assert.equal(checkRateLimit("b", 1, now).limited, false);
});

test("getClientIp takes the first x-forwarded-for entry", () => {
  const req = new Request("https://chat.example/api/chat", {
    headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" },
  });
  assert.equal(getClientIp(req), "203.0.113.7");
});

test("getClientIp falls back to 'unknown' when the header is absent", () => {
  const req = new Request("https://chat.example/api/chat");
  assert.equal(getClientIp(req), "unknown");
});
