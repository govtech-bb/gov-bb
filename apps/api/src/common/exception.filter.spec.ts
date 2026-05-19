import { HttpException, HttpStatus } from "@nestjs/common";
import { SpanStatusCode } from "@opentelemetry/api";
import { GlobalExceptionFilter } from "./exception.filter";

const mockSpan = {
  setStatus: jest.fn(),
  recordException: jest.fn(),
  setAttributes: jest.fn(),
};

jest.mock("@opentelemetry/api", () => ({
  trace: {
    getActiveSpan: jest.fn(),
  },
  SpanStatusCode: { ERROR: 2 },
}));

import { trace } from "@opentelemetry/api";

const mockMetricsService = {
  recordValidationFailure: jest.fn(),
  recordHttpError: jest.fn(),
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

const mockReq = { method: "GET", url: "/test", path: "/test" };

describe("GlobalExceptionFilter", () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    (trace.getActiveSpan as jest.Mock).mockReturnValue(undefined);
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
  });

  describe("metrics side-effects", () => {
    it("400 HttpException → calls recordValidationFailure with req.path", () => {
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
  });

  describe("OpenTelemetry span", () => {
    it("active span → setStatus and recordException called", () => {
      (trace.getActiveSpan as jest.Mock).mockReturnValue(mockSpan);

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
      (trace.getActiveSpan as jest.Mock).mockReturnValue(undefined);

      expect(() =>
        filter.catch(new Error("boom"), makeHost(makeRes(), mockReq)),
      ).not.toThrow();
    });
  });
});
