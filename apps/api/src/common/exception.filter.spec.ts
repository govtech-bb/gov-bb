import type { Mock } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import { SpanStatusCode } from "@opentelemetry/api";
import { GlobalExceptionFilter } from "./exception.filter";

const mockSpan = {
  setStatus: vi.fn(),
  recordException: vi.fn(),
  setAttributes: vi.fn(),
};

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getActiveSpan: vi.fn(),
  },
  SpanStatusCode: { ERROR: 2 },
}));

import { trace } from "@opentelemetry/api";

const mockMetricsService = {
  recordValidationFailure: vi.fn(),
  recordHttpError: vi.fn(),
};

function makeHost(res: object, req: object) {
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  } as never;
}

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
    },
  };
  return res;
}

const mockReq = {
  method: "GET",
  url: "/test",
  path: "/test",
  route: { path: "/test" },
};

describe("GlobalExceptionFilter", () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    vi.clearAllMocks();
    (trace.getActiveSpan as Mock).mockReturnValue(undefined);
    filter = new GlobalExceptionFilter(mockMetricsService as never);
  });

  describe("response shape", () => {
    it("HttpException 400 → statusCode 400 with message in body", () => {
      const res = makeRes();
      filter.catch(new HttpException("Bad input", 400), makeHost(res, mockReq));

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ statusCode: 400, message: "Bad input" });
    });

    it("HttpException 404 → statusCode 404 with message in body", () => {
      const res = makeRes();
      filter.catch(
        new HttpException("Not found", HttpStatus.NOT_FOUND),
        makeHost(res, mockReq),
      );

      expect(res.statusCode).toBe(404);
      expect(res.body).toMatchObject({ statusCode: 404, message: "Not found" });
    });

    it("generic Error (non-HTTP) → statusCode 500", () => {
      const res = makeRes();
      filter.catch(new Error("boom"), makeHost(res, mockReq));

      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({ statusCode: 500 });
    });

    it("non-HttpException Error carrying a 4xx .status → that status (#298)", () => {
      const res = makeRes();
      const err = Object.assign(new Error("request entity too large"), {
        status: 413,
      });
      filter.catch(err, makeHost(res, mockReq));

      expect(res.statusCode).toBe(413);
      expect(res.body).toMatchObject({ statusCode: 413 });
    });

    it("non-HttpException Error with a 5xx .status still collapses to 500 (#298)", () => {
      const res = makeRes();
      const err = Object.assign(new Error("upstream boom"), { status: 502 });
      filter.catch(err, makeHost(res, mockReq));

      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({ statusCode: 500 });
    });
  });

  describe("metrics side-effects", () => {
    it("400 HttpException → calls recordValidationFailure with the route template", () => {
      filter.catch(
        new HttpException("Bad input", 400),
        makeHost(makeRes(), mockReq),
      );

      expect(mockMetricsService.recordValidationFailure).toHaveBeenCalledWith(
        "/test",
      );
    });

    it("any HttpException → calls recordHttpError", () => {
      filter.catch(
        new HttpException("Not found", 404),
        makeHost(makeRes(), mockReq),
      );

      expect(mockMetricsService.recordHttpError).toHaveBeenCalledWith(
        404,
        "GET",
        "/test",
      );
    });

    it("non-400 HttpException → does NOT call recordValidationFailure", () => {
      filter.catch(
        new HttpException("Not found", 404),
        makeHost(makeRes(), mockReq),
      );

      expect(mockMetricsService.recordValidationFailure).not.toHaveBeenCalled();
    });

    it("unmatched route (scanner 404) → records http.route as 'unmatched', never the raw path", () => {
      const scannerReq = {
        method: "GET",
        url: "/config/secrets/db.cfg",
        path: "/config/secrets/db.cfg",
      };

      filter.catch(
        new HttpException("Not found", 404),
        makeHost(makeRes(), scannerReq),
      );

      expect(mockMetricsService.recordHttpError).toHaveBeenCalledWith(
        404,
        "GET",
        "unmatched",
      );
    });

    it("matched route → records http.route as the route template, not the concrete URL", () => {
      const matchedReq = {
        method: "POST",
        url: "/forms/abc-123",
        path: "/forms/abc-123",
        route: { path: "/forms/:id" },
      };

      filter.catch(
        new HttpException("Bad input", 400),
        makeHost(makeRes(), matchedReq),
      );

      expect(mockMetricsService.recordHttpError).toHaveBeenCalledWith(
        400,
        "POST",
        "/forms/:id",
      );
    });
  });

  describe("OpenTelemetry span", () => {
    it("active span → setStatus and recordException called", () => {
      (trace.getActiveSpan as Mock).mockReturnValue(mockSpan);

      filter.catch(
        new HttpException("oops", 500),
        makeHost(makeRes(), mockReq),
      );

      expect(mockSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ code: SpanStatusCode.ERROR }),
      );
      expect(mockSpan.recordException).toHaveBeenCalled();
    });

    it("no active span → no crash", () => {
      (trace.getActiveSpan as Mock).mockReturnValue(undefined);

      expect(() =>
        filter.catch(new Error("boom"), makeHost(makeRes(), mockReq)),
      ).not.toThrow();
    });

    it("active span → recordException wraps non-Error exception in a new Error", () => {
      (trace.getActiveSpan as Mock).mockReturnValue(mockSpan);

      // A plain string is not an Error instance — should be wrapped
      filter.catch("plain string exception", makeHost(makeRes(), mockReq));

      expect(mockSpan.recordException).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("parseException branches", () => {
    it("HttpException with object body containing errors → Validation failed + errors", () => {
      const res = makeRes();
      const fieldErrors = { name: ["required"] };
      const exception = new HttpException(
        { message: "Bad Request", errors: fieldErrors },
        400,
      );

      filter.catch(exception, makeHost(res, mockReq));

      expect(res.body).toMatchObject({
        message: "Validation failed",
        meta: { errors: fieldErrors },
      });
    });

    it("HttpException with array message → Validation failed + errors array", () => {
      const res = makeRes();
      const messages = ["name must not be empty", "email must be a string"];
      const exception = new HttpException(
        { message: messages, statusCode: 400 },
        400,
      );

      filter.catch(exception, makeHost(res, mockReq));

      expect(res.body).toMatchObject({
        message: "Validation failed",
        meta: { errors: messages },
      });
    });

    it("HttpException with object body containing string message → uses that message", () => {
      const res = makeRes();
      const exception = new HttpException(
        { message: "Custom object message", statusCode: 422 },
        422,
      );

      filter.catch(exception, makeHost(res, mockReq));

      expect(res.body).toMatchObject({ message: "Custom object message" });
    });

    it("HttpException with object body missing message → falls back to exception.message", () => {
      const res = makeRes();
      // getResponse() returns an object without a "message" key
      const exception = new HttpException({ code: "E001" }, 409);

      filter.catch(exception, makeHost(res, mockReq));

      // Falls through to `return { statusCode, message: exception.message }`
      expect(res.body).toMatchObject({ statusCode: 409 });
    });
  });

  describe("non-HttpException error passthrough", () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    });

    it("non-prod → body.meta.error includes name and message", () => {
      process.env.NODE_ENV = "development";
      const res = makeRes();

      filter.catch(new TypeError("kapow"), makeHost(res, mockReq));

      expect(res.body).toMatchObject({
        statusCode: 500,
        meta: { error: { name: "TypeError", message: "kapow" } },
      });
    });

    it("production → body has no meta.error", () => {
      process.env.NODE_ENV = "production";
      const res = makeRes();

      filter.catch(new Error("boom"), makeHost(res, mockReq));

      const body = res.body as { meta?: unknown };
      expect(body.meta).toBeUndefined();
      expect(res.body).toMatchObject({
        statusCode: 500,
        message: "An unexpected error occurred",
      });
    });
  });
});
