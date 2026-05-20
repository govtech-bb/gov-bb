import { MetricsService } from "./metrics.service";

// ---------------------------------------------------------------------------
// Mock @opentelemetry/api at the module boundary
// ---------------------------------------------------------------------------
const mockAdd = jest.fn();
const mockCreateCounter = jest.fn().mockReturnValue({ add: mockAdd });
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
    // Reset mock to always return a counter with the add spy
    mockCreateCounter.mockReturnValue({ add: mockAdd });
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

      expect(mockAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          "form.id": "passport-renewal",
          outcome: "created",
        }),
      );
    });

    it("increments duplicateSubmissionsCounter when outcome is 'duplicate'", () => {
      service.recordSubmission("passport-renewal", "duplicate");

      // The duplicate counter's add should be called
      expect(mockAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          "form.id": "passport-renewal",
          outcome: "duplicate",
        }),
      );
    });

    it("increments duplicateSubmissionsCounter when outcome is 'in_progress'", () => {
      service.recordSubmission("passport-renewal", "in_progress");

      expect(mockAdd).toHaveBeenCalledWith(
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

      expect(mockAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ "http.route": "/api/submissions" }),
      );
    });

    it("calls add exactly once per invocation", () => {
      mockAdd.mockClear();
      service.recordValidationFailure("/api/forms");

      expect(mockAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe("recordHttpError", () => {
    it("increments httpErrorsCounter with status code, method, and path labels", () => {
      service.recordHttpError(500, "POST", "/api/submissions");

      expect(mockAdd).toHaveBeenCalledWith(
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

      expect(mockAdd).toHaveBeenCalledWith(
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
