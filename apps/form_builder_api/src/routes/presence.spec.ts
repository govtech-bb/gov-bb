import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

import { getDataSource } from "../db.js";
import {
  claimPresenceHandler,
  getPresenceHandler,
  releasePresenceHandler,
  holdsFreshClaim,
} from "./presence";

const getDataSourceMock = getDataSource as Mock;

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  return { body, params } as unknown as Request;
}

interface CapturingResponse extends Response {
  statusCode: number;
  body: unknown;
}

function mockRes(): CapturingResponse {
  const res = { statusCode: 200, body: undefined } as CapturingResponse;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = vi.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  return res;
}

const ROW = {
  user_login: "alice",
  claimed_at: "2026-06-08T10:00:00.000Z",
  last_activity_at: "2026-06-08T10:05:00.000Z",
};
const HOLDER = {
  userLogin: "alice",
  claimedAt: "2026-06-08T10:00:00.000Z",
  lastActivityAt: "2026-06-08T10:05:00.000Z",
};

describe("claimPresenceHandler", () => {
  it("returns held:true with the holder when the conditional upsert claims the row", async () => {
    const query = vi.fn().mockResolvedValueOnce([ROW]);
    getDataSourceMock.mockResolvedValue({ query });

    const res = mockRes();
    await claimPresenceHandler(
      mockReq({ userLogin: "alice" }, { formId: "f1" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ held: true, holder: HOLDER });
    // Only the upsert ran — no second lookup needed when we hold it.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns held:false with the current holder when someone else holds a fresh claim", async () => {
    // Upsert returns no row (WHERE filtered the update); the holder lookup then
    // returns the live holder.
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ROW]);
    getDataSourceMock.mockResolvedValue({ query });

    const res = mockRes();
    await claimPresenceHandler(
      mockReq({ userLogin: "bob" }, { formId: "f1" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ held: false, holder: HOLDER });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("retries and takes over when the filtered claim's holder vanished mid-read", async () => {
    // attempt 0: upsert filtered ([]), holder read empty ([]) → holder lapsed;
    // attempt 1: upsert now succeeds ([ROW]) → caller takes it over.
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ROW]);
    getDataSourceMock.mockResolvedValue({ query });

    const res = mockRes();
    await claimPresenceHandler(
      mockReq({ userLogin: "alice" }, { formId: "f1" }),
      res,
    );

    expect(res.body).toEqual({ held: true, holder: HOLDER });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("returns held:false holder:null when the claim stays unresolved after the retry", async () => {
    // Every query returns empty: filtered upsert + empty holder read, twice.
    const query = vi.fn().mockResolvedValue([]);
    getDataSourceMock.mockResolvedValue({ query });

    const res = mockRes();
    await claimPresenceHandler(
      mockReq({ userLogin: "bob" }, { formId: "f1" }),
      res,
    );

    expect(res.body).toEqual({ held: false, holder: null });
    // Two attempts: (upsert, holder-read) × 2.
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("rejects a missing/empty userLogin with 400 and never touches the DB", async () => {
    const query = vi.fn();
    getDataSourceMock.mockResolvedValue({ query });

    for (const body of [{}, { userLogin: "" }, { userLogin: "   " }]) {
      const res = mockRes();
      await claimPresenceHandler(mockReq(body, { formId: "f1" }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 500 on a DB error", async () => {
    getDataSourceMock.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await claimPresenceHandler(
      mockReq({ userLogin: "alice" }, { formId: "f1" }),
      res,
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("getPresenceHandler", () => {
  it("returns the fresh holder when one exists", async () => {
    const query = vi.fn().mockResolvedValue([ROW]);
    getDataSourceMock.mockResolvedValue({ query });

    const res = mockRes();
    await getPresenceHandler(mockReq({}, { formId: "f1" }), res);

    expect(res.body).toEqual({ holder: HOLDER });
  });

  it("returns holder:null when no fresh claim exists", async () => {
    const query = vi.fn().mockResolvedValue([]);
    getDataSourceMock.mockResolvedValue({ query });

    const res = mockRes();
    await getPresenceHandler(mockReq({}, { formId: "f1" }), res);

    expect(res.body).toEqual({ holder: null });
  });

  it("returns 500 on a DB error", async () => {
    getDataSourceMock.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await getPresenceHandler(mockReq({}, { formId: "f1" }), res);
    expect(res.statusCode).toBe(500);
  });
});

describe("releasePresenceHandler", () => {
  it("deletes only the caller's row and returns released:true", async () => {
    const query = vi.fn().mockResolvedValue([]);
    getDataSourceMock.mockResolvedValue({ query });

    const res = mockRes();
    await releasePresenceHandler(
      mockReq({ userLogin: "alice" }, { formId: "f1" }),
      res,
    );

    expect(res.body).toEqual({ released: true });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM"), [
      "f1",
      "alice",
    ]);
  });

  it("rejects a missing userLogin with 400 and never touches the DB", async () => {
    const query = vi.fn();
    getDataSourceMock.mockResolvedValue({ query });

    const res = mockRes();
    await releasePresenceHandler(mockReq({}, { formId: "f1" }), res);

    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 500 on a DB error", async () => {
    getDataSourceMock.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await releasePresenceHandler(
      mockReq({ userLogin: "alice" }, { formId: "f1" }),
      res,
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("holdsFreshClaim", () => {
  it("short-circuits to false for an empty login without querying", async () => {
    const query = vi.fn();
    expect(await holdsFreshClaim({ query }, "f1", "")).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("is true when a matching fresh row exists", async () => {
    const query = vi.fn().mockResolvedValue([{ "?column?": 1 }]);
    expect(await holdsFreshClaim({ query }, "f1", "alice")).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT 1"), [
      "f1",
      "alice",
    ]);
  });

  it("is false when no matching fresh row exists", async () => {
    const query = vi.fn().mockResolvedValue([]);
    expect(await holdsFreshClaim({ query }, "f1", "alice")).toBe(false);
  });
});
