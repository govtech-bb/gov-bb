import type { Request, Response } from "express";
import { authMiddleware } from "./auth";

// Fake Express res capturing the status + json the middleware writes.
function makeRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function makeReq(token?: string): Request {
  return {
    headers: token === undefined ? {} : { "x-admin-token": token },
  } as unknown as Request;
}

describe("authMiddleware", () => {
  let savedToken: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    savedToken = process.env.ADMIN_API_TOKEN;
    savedNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    restore("ADMIN_API_TOKEN", savedToken);
    restore("NODE_ENV", savedNodeEnv);
  });

  function restore(key: string, value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  describe("no token configured", () => {
    beforeEach(() => {
      delete process.env.ADMIN_API_TOKEN;
    });

    it("responds 500 in production (fail closed)", () => {
      process.env.NODE_ENV = "production";
      const res = makeRes();
      const next = vi.fn();
      authMiddleware(makeReq(), res as unknown as Response, next);
      expect(res.statusCode).toBe(500);
      expect(next).not.toHaveBeenCalled();
    });

    it("passes through outside production (dev bypass)", () => {
      process.env.NODE_ENV = "development";
      const res = makeRes();
      const next = vi.fn();
      authMiddleware(makeReq(), res as unknown as Response, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    });
  });

  describe("token configured", () => {
    beforeEach(() => {
      process.env.ADMIN_API_TOKEN = "s3cret";
      process.env.NODE_ENV = "production";
    });

    it("calls next when the X-Admin-Token matches", () => {
      const res = makeRes();
      const next = vi.fn();
      authMiddleware(makeReq("s3cret"), res as unknown as Response, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    });

    it("responds 401 when the header is missing", () => {
      const res = makeRes();
      const next = vi.fn();
      authMiddleware(makeReq(), res as unknown as Response, next);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Missing X-Admin-Token header" });
      expect(next).not.toHaveBeenCalled();
    });

    it("responds 403 when the token is wrong", () => {
      const res = makeRes();
      const next = vi.fn();
      authMiddleware(makeReq("wrong"), res as unknown as Response, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: "Invalid admin token" });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
