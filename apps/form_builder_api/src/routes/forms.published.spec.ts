import type { Request, Response } from "express";

jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));

import { listPublishedHandler } from "./forms";

function mockRes() {
  const res = { body: undefined as unknown, statusCode: 200 } as Response & {
    body: unknown;
    statusCode: number;
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = jest.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  return res;
}

describe("GET /builder/forms/published", () => {
  const originalEnv = process.env.API_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://api.test";
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = originalEnv;
    global.fetch = originalFetch;
  });

  it("unwraps body.data from apps/api and returns it verbatim", async () => {
    const payload = {
      success: true,
      data: [
        { formId: "passport", title: "Passport", version: "1.0.0" },
        { formId: "licence", title: "Drivers Licence", version: "2.3.1" },
      ],
      message: "Form definitions retrieved",
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(payload),
    }) as unknown as typeof fetch;

    const res = mockRes();
    await listPublishedHandler({} as Request, res);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/form-definitions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(payload.data);
  });

  it("returns 502 with upstream status + body when apps/api responds non-2xx", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue("Service Unavailable"),
    }) as unknown as typeof fetch;

    const res = mockRes();
    await listPublishedHandler({} as Request, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({
      error: expect.stringMatching(/upstream/i),
      upstreamStatus: 503,
      upstreamBody: "Service Unavailable",
    });
  });

  it("returns 502 when fetch itself throws (network error)", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const res = mockRes();
    await listPublishedHandler({} as Request, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({
      error: expect.stringMatching(/ECONNREFUSED|upstream/i),
    });
  });

  it("falls back to the sandbox API when API_BASE_URL is unset", async () => {
    delete process.env.API_BASE_URL;
    const payload = { success: true, data: [], message: "" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(payload),
    }) as unknown as typeof fetch;

    const res = mockRes();
    await listPublishedHandler({} as Request, res);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://forms.api.sandbox.alpha.gov.bb/form-definitions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(payload.data);
  });

  it("strips a trailing slash on API_BASE_URL before appending the path", async () => {
    process.env.API_BASE_URL = "http://api.test/";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ data: [] }),
    }) as unknown as typeof fetch;

    const res = mockRes();
    await listPublishedHandler({} as Request, res);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/form-definitions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns 500 without fetching when API_BASE_URL is not a parseable URL", async () => {
    process.env.API_BASE_URL = "not a url";
    global.fetch = jest.fn() as unknown as typeof fetch;

    const res = mockRes();
    await listPublishedHandler({} as Request, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      error: expect.stringMatching(/API_BASE_URL/),
    });
  });

  it.each([["file:///etc/passwd"], ["ftp://api.test"], ["gopher://api.test"]])(
    "returns 500 without fetching when API_BASE_URL uses non-http(s) protocol (%s)",
    async (badUrl) => {
      process.env.API_BASE_URL = badUrl;
      global.fetch = jest.fn() as unknown as typeof fetch;

      const res = mockRes();
      await listPublishedHandler({} as Request, res);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({
        error: expect.stringMatching(/API_BASE_URL/),
      });
    },
  );

  it("accepts https URLs", async () => {
    process.env.API_BASE_URL = "https://api.test";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ data: [] }),
    }) as unknown as typeof fetch;

    const res = mockRes();
    await listPublishedHandler({} as Request, res);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/form-definitions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(res.statusCode).toBe(200);
  });
});
