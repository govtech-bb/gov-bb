import type { Request, Response } from "express";

/** Minimal express mocks for unit-testing route handlers directly. */

export function mockReq(
  body: unknown = {},
  params: Record<string, string> = {},
): Request {
  return { body, params } as unknown as Request;
}

export interface CapturingResponse extends Response {
  statusCode: number;
  body: unknown;
}

export function mockRes(): CapturingResponse {
  const res = { statusCode: 200, body: undefined } as CapturingResponse;
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
