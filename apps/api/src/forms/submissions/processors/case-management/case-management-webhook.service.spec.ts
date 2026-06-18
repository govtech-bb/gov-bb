import { Logger } from "@nestjs/common";
import {
  CaseManagementWebhookService,
  type FormSubmittedWebhookPayload,
} from "./case-management-webhook.service";

const mockFetch = vi.fn();
global.fetch = mockFetch;

type WebhooksConfig = {
  url: string;
  path: string;
  secret: string;
  timeoutMs: number;
};

function makeService(overrides: Partial<WebhooksConfig> = {}) {
  const config: WebhooksConfig = {
    url: "http://case-mgmt.local",
    path: "api/webhooks/form-submitted",
    secret: "dev-secret-key-1234567890",
    timeoutMs: 10_000,
    ...overrides,
  };
  return new CaseManagementWebhookService(
    config as unknown as ConstructorParameters<
      typeof CaseManagementWebhookService
    >[0],
  );
}

const payload: FormSubmittedWebhookPayload = {
  code: "CAMP-0616-AAA1234",
  programmeCode: "CAMP",
  applicantName: "Ada Lovelace",
  applicantEmail: "ada@example.bb",
  applicantPhone: "+1246555000",
  formData: { motivation: "Robotics" },
  submittedAt: "2026-06-16T09:00:00.000Z",
};

describe("CaseManagementWebhookService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it("skips dispatch (no fetch) when url/secret are not configured", async () => {
    await makeService({ url: "" }).dispatch(payload);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(makeService({ secret: "" }).isConfigured()).toBe(false);
  });

  it("POSTs the snake_case body with the X-API-Key header", async () => {
    await makeService().dispatch(payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://case-mgmt.local/api/webhooks/form-submitted");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("dev-secret-key-1234567890");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      code: "CAMP-0616-AAA1234",
      programme_code: "CAMP",
      applicant: {
        name: "Ada Lovelace",
        email: "ada@example.bb",
        phone: "+1246555000",
      },
      form_data: { motivation: "Robotics" },
      submitted_at: "2026-06-16T09:00:00.000Z",
    });
  });

  it("resolves the configurable path against the base url", async () => {
    await makeService({
      url: "http://host.docker.internal:3000",
      path: "api/cases",
    }).dispatch(payload);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "http://host.docker.internal:3000/api/cases",
    );
  });

  it("tolerates a trailing slash on url and leading slash on path", async () => {
    await makeService({
      url: "http://case-mgmt.local/",
      path: "/api/cases",
    }).dispatch(payload);
    expect(mockFetch.mock.calls[0][0]).toBe("http://case-mgmt.local/api/cases");
  });

  it("throws on a non-2xx response (so SQS retry/DLQ engages)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });
    await expect(makeService().dispatch(payload)).rejects.toThrow(/HTTP 502/);
  });

  it("logs the exact payload before dispatching", async () => {
    const logSpy = vi.spyOn(Logger.prototype, "log");
    await makeService().dispatch(payload);

    const sentBody = mockFetch.mock.calls[0][1].body;
    const logged = logSpy.mock.calls.find((c) =>
      String(c[0]).includes("payload:"),
    );
    expect(logged).toBeDefined();
    // the logged payload is the exact serialized body POSTed
    expect(String(logged?.[0])).toContain(sentBody);
    logSpy.mockRestore();
  });
});
