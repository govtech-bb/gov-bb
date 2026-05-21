import { MetricsService } from "./metrics.service";

// ---------------------------------------------------------------------------
// Mock @opentelemetry/api at the module boundary
// ---------------------------------------------------------------------------
const counterAddByName = new Map<string, jest.Mock>();
const getCounterAdd = (name: string) => {
  const existing = counterAddByName.get(name);
  if (existing) {
    return existing;
  }
  const add = jest.fn();
  counterAddByName.set(name, add);
  return add;
};
const mockCreateCounter = jest.fn((name: string) => ({
  add: getCounterAdd(name),
}));
const mockGetMeter = jest.fn().mockReturnValue({
  createCounter: mockCreateCounter,
});

jest.mock("@opentelemetry/api", () => ({
  metrics: {
    getMeter: (...args: unknown[]) => mockGetMeter(...args),
  },
}));

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    counterAddByName.clear();
    mockGetMeter.mockReturnValue({ createCounter: mockCreateCounter });

    service = new MetricsService();
    service.onModuleInit();
  });

  describe("onModuleInit", () => {
    it("initialises by requesting the 'modular-forms-api' meter", () => {
      expect(mockGetMeter).toHaveBeenCalledWith("modular-forms-api");
    });

    it("creates four counters on init", () => {
      expect(mockCreateCounter).toHaveBeenCalledTimes(4);
      expect(mockCreateCounter).toHaveBeenCalledWith("form.submissions.total", {
        description: "Total number of form submissions",
      });
      expect(mockCreateCounter).toHaveBeenCalledWith(
        "form.submissions.duplicates",
        {
          description: "Number of duplicate or in-progress submission attempts",
        },
      );
      expect(mockCreateCounter).toHaveBeenCalledWith(
        "form.validation.failures",
        {
          description:
            "Number of request validation failures (400s from ValidationPipe)",
        },
      );
      expect(mockCreateCounter).toHaveBeenCalledWith("http.errors.total", {
        description: "Total number of HTTP errors by status code",
      });
    });

    it("does not throw when OpenTelemetry returns a no-op meter (graceful degradation)", () => {
      // Simulate OTel not configured — getMeter returns a no-op object
      const noopAdd = jest.fn();
      const noopCounter = { add: noopAdd };
      const noopMeter = {
        createCounter: jest.fn().mockReturnValue(noopCounter),
      };
      mockGetMeter.mockReturnValueOnce(noopMeter);

      const noopService = new MetricsService();
      expect(() => noopService.onModuleInit()).not.toThrow();
    });
  });

  describe("recordSubmission", () => {
    it("increments submissionsCounter when outcome is 'created'", () => {
      service.recordSubmission("passport-renewal", "created");

      expect(getCounterAdd("form.submissions.total")).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          "form.id": "passport-renewal",
          outcome: "created",
        }),
      );
    });

    it("increments duplicateSubmissionsCounter when outcome is 'duplicate'", () => {
      service.recordSubmission("passport-renewal", "duplicate");

      expect(getCounterAdd("form.submissions.duplicates")).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          "form.id": "passport-renewal",
          outcome: "duplicate",
        }),
      );
    });

    it("increments duplicateSubmissionsCounter when outcome is 'in_progress'", () => {
      service.recordSubmission("passport-renewal", "in_progress");

      expect(getCounterAdd("form.submissions.duplicates")).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          "form.id": "passport-renewal",
          outcome: "in_progress",
        }),
      );
    });
  });

  describe("recordValidationFailure", () => {
    it("increments validationFailuresCounter with the http.route label", () => {
      service.recordValidationFailure("/api/submissions");

      expect(getCounterAdd("form.validation.failures")).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ "http.route": "/api/submissions" }),
      );
    });

    it("calls add exactly once per invocation", () => {
      service.recordValidationFailure("/api/forms");

      expect(getCounterAdd("form.validation.failures")).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe("recordHttpError", () => {
    it("increments httpErrorsCounter with status code, method, and path labels", () => {
      service.recordHttpError(500, "POST", "/api/submissions");

      expect(getCounterAdd("http.errors.total")).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          "http.status_code": 500,
          "http.method": "POST",
          "http.route": "/api/submissions",
        }),
      );
    });

    it("records a 404 error correctly", () => {
      service.recordHttpError(404, "GET", "/api/forms/unknown");

      expect(getCounterAdd("http.errors.total")).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          "http.status_code": 404,
          "http.method": "GET",
          "http.route": "/api/forms/unknown",
        }),
      );
    });
  });
});
