/**
 * The site routes' per-client limit, keyed on the client the load balancer
 * forwards: a private-address peer (the ALB) is trusted for X-Forwarded-For,
 * a public one is not, and nothing outside the site routes is limited.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Redacted } from "./modules/redacted";
import { LANDING_TOKEN } from "./routes/site";
import {
  createTestApp,
  createTestDb,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

/** An ALB node's address inside the VPC. */
const ALB = "10.0.0.5";

let test: TestDb;
let app: FastifyInstance;

beforeAll(async () => {
  test = await createTestDb();
  app = await createTestApp(test.db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await test.close();
});

const get = (url: string, remoteAddress: string, forwardedFor?: string) =>
  app.inject({
    url,
    remoteAddress,
    headers:
      forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
  });

const remaining = async (
  remoteAddress: string,
  forwardedFor?: string,
): Promise<string | undefined> => {
  const response = await get("/catalog", remoteAddress, forwardedFor);
  return response.headers["x-ratelimit-remaining"] as string | undefined;
};

describe("site rate limit", () => {
  it("limits the site routes at 1,000 a minute and nothing else", async () => {
    for (const url of ["/pages?url=/x", "/catalog"]) {
      const response = await get(url, "192.0.2.1");
      expect(response.headers["x-ratelimit-limit"]).toBe("1000");
    }
    const docs = await get("/docs/openapi.json", "192.0.2.1");
    expect(docs.statusCode).toBe(200);
    expect(docs.headers).not.toHaveProperty("x-ratelimit-limit");
    const editor = await app.inject({
      url: "/services",
      remoteAddress: "192.0.2.1",
      headers: TEST_HEADERS,
    });
    expect(editor.statusCode).toBe(200);
    expect(editor.headers).not.toHaveProperty("x-ratelimit-limit");
  });

  it("keys on the client the load balancer forwards, not on the load balancer", async () => {
    expect(await remaining(ALB, "203.0.113.9")).toBe("999");
    expect(await remaining(ALB, "203.0.113.9")).toBe("998");
    expect(await remaining(ALB, "203.0.113.10")).toBe("999");
  });

  it("ignores what a client adds to X-Forwarded-For itself", async () => {
    // Left of the ALB's entry: the spoofed prefix does not open a new bucket.
    expect(await remaining(ALB, "203.0.113.30")).toBe("999");
    expect(await remaining(ALB, "198.51.100.1, 203.0.113.30")).toBe("998");
    // From a public peer the header is not trusted at all.
    expect(await remaining("198.51.100.77", "203.0.113.20")).toBe("999");
    expect(await remaining("198.51.100.77", "203.0.113.21")).toBe("998");
  });

  it("refuses the 1,001st request in a minute with the API's error shape", async () => {
    for (let i = 0; i < 1000; i++) {
      const ok = await get("/categories", ALB, "203.0.113.50");
      expect(ok.statusCode).toBe(200);
    }
    const refused = await get("/categories", ALB, "203.0.113.50");
    expect(refused.statusCode).toBe(429);
    expect(refused.headers["retry-after"]).toBeDefined();
    expect(refused.json()).toEqual({
      error: "too_many_requests",
      message: expect.any(String),
    });
    const other = await get("/categories", ALB, "203.0.113.51");
    expect(other.statusCode).toBe(200);
  });

  it("exempts no one when no landing secret is configured", async () => {
    const response = await app.inject({
      url: "/catalog",
      remoteAddress: "192.0.2.2",
      headers: { [LANDING_TOKEN]: "anything" },
    });
    expect(response.headers["x-ratelimit-limit"]).toBe("1000");
  });
});

describe("landing's exemption", () => {
  let landing: FastifyInstance;

  beforeAll(async () => {
    landing = await createTestApp(test.db, {
      landingSecret: new Redacted("landing-secret"),
    });
    await landing.ready();
  });

  afterAll(() => landing.close());

  const read = (token?: string) =>
    landing.inject({
      url: "/categories",
      remoteAddress: "192.0.2.3",
      headers: token === undefined ? {} : { [LANDING_TOKEN]: token },
    });

  it("never limits landing's token, but limits a wrong or missing one", async () => {
    for (let i = 0; i < 1000; i++) expect((await read()).statusCode).toBe(200);
    expect((await read()).statusCode).toBe(429);
    expect((await read("wrong")).statusCode).toBe(429);
    const exempt = await read("landing-secret");
    expect(exempt.statusCode).toBe(200);
    expect(exempt.headers).not.toHaveProperty("x-ratelimit-limit");
  });
});
