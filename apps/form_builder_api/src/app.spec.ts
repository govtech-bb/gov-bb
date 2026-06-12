import request from "supertest";
import type { Express } from "express";

// The builderLimiter reads BUILDER_RATE_LIMIT at module-load time, so these
// env vars must be set BEFORE `app` is imported. A static top-level import
// would be hoisted above these assignments and lock in the default limit, so
// we set env here and `await import("./app")` inside beforeAll instead.
const RATE_LIMIT = 2;

describe("builderLimiter on /builder/*", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.BUILDER_RATE_LIMIT = String(RATE_LIMIT);
    // A configured token means authMiddleware rejects header-less requests
    // with 401 *before* any DB/GitHub work — so the under-limit requests stay
    // cheap while still passing through the limiter that sits ahead of auth.
    process.env.ADMIN_API_TOKEN = "test-token";
    ({ app } = await import("./app"));
  });

  it("returns 429 once the per-window request limit is exceeded", async () => {
    // The first RATE_LIMIT requests pass the limiter and hit authMiddleware,
    // which 401s (no x-admin-token header) — proving the limiter let them
    // through. The very next request trips the limiter.
    for (let i = 0; i < RATE_LIMIT; i++) {
      const res = await request(app).get("/builder/forms");
      expect(res.status).toBe(401);
    }

    const limited = await request(app).get("/builder/forms");
    expect(limited.status).toBe(429);
  });
});
