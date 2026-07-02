import { describe, it, expect } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { z } from "zod";
import { errorHandler } from "./error-handler";
import { HttpError } from "../lib/http-error";

// Mount a minimal app that exercises the terminal handler the way the real app
// does: async route handlers that throw, with `errorHandler` registered last.
// Express 5 auto-forwards a rejected async handler to error middleware, so this
// also verifies that forwarding (no asyncHandler shim needed).
function buildApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/ok", (_req, res) => {
    res.json({ hello: "world" });
  });
  app.get("/http-error", async () => {
    throw new HttpError(409, "Another editor holds this form.");
  });
  app.get("/zod", async (req, res) => {
    // req.query has no `name`, so parse throws a ZodError.
    z.object({ name: z.string() }).parse(req.query);
    res.json({ ok: true });
  });
  app.get("/boom", async () => {
    throw new Error("kaboom");
  });

  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("maps an HttpError to its status with a bare { error } body", async () => {
    const res = await request(buildApp()).get("/http-error");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Another editor holds this form." });
  });

  it("maps a ZodError to 400 with a formatted { error } body", async () => {
    const res = await request(buildApp()).get("/zod");
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("name");
  });

  it("maps an unexpected throw to 500 carrying the error message", async () => {
    const res = await request(buildApp()).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "kaboom" });
  });

  it("leaves a successful response body untouched", async () => {
    const res = await request(buildApp()).get("/ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hello: "world" });
  });
});
