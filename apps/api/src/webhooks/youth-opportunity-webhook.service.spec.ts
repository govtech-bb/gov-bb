import type { Mock } from "vitest";
import { Logger } from "@nestjs/common";
import { of, throwError } from "rxjs";
import {
  YouthOpportunityWebhookService,
  type FormSubmittedWebhookPayload,
} from "./youth-opportunity-webhook.service";

type WebhooksConfig = { url: string; secret: string; timeoutMs: number };

function makePayload(): FormSubmittedWebhookPayload {
  return {
    code: "BYAC-0306-A1Z9QF",
    programmeCode: "BYAC",
    applicantName: "Jane Doe",
    applicantEmail: "jane@example.com",
    applicantPhone: "246-555-1234",
    formData: { "applicant-parish": "St. Michael" },
    submittedAt: "2026-06-03T10:00:00.000Z",
  };
}

// The service now sends via the shared `timedPost`, which calls
// `HttpService.request` (not `.post`), so the mock provides `request`.
function makeService(config: Partial<WebhooksConfig>, request: Mock) {
  const http = { request } as unknown as ConstructorParameters<
    typeof YouthOpportunityWebhookService
  >[0];
  const cfg = {
    url: "https://cases.example.gov.bb",
    secret: "shared-secret",
    timeoutMs: 10_000,
    ...config,
  } as WebhooksConfig as never;
  return new YouthOpportunityWebhookService(http, cfg);
}

describe("YouthOpportunityWebhookService", () => {
  it("posts the frontend-alpha payload to /api/webhooks/form-submitted with redirects disabled", async () => {
    const request = vi.fn().mockReturnValue(of({ status: 200 }));
    await makeService({}, request).dispatch(makePayload());

    const [opts] = request.mock.calls[0];
    expect(opts.url).toBe(
      "https://cases.example.gov.bb/api/webhooks/form-submitted",
    );
    expect(JSON.parse(opts.data)).toEqual({
      code: "BYAC-0306-A1Z9QF",
      programme_code: "BYAC",
      applicant: {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "246-555-1234",
      },
      form_data: { "applicant-parish": "St. Michael" },
      submitted_at: "2026-06-03T10:00:00.000Z",
    });
    expect(opts.headers["X-API-Key"]).toBe("shared-secret");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.timeout).toBe(10_000);
    // SSRF guard (#2000): a 3xx to an internal host must not be followed.
    expect(opts.maxRedirects).toBe(0);
  });

  it("resolves the endpoint when the base URL has a trailing slash", async () => {
    const request = vi.fn().mockReturnValue(of({ status: 200 }));
    await makeService(
      { url: "https://cases.example.gov.bb/" },
      request,
    ).dispatch(makePayload());
    expect(request.mock.calls[0][0].url).toBe(
      "https://cases.example.gov.bb/api/webhooks/form-submitted",
    );
  });

  it("skips dispatch (and warns) when url or secret is missing", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const request = vi.fn();
    await makeService({ url: "" }, request).dispatch(makePayload());
    await makeService({ secret: "" }, request).dispatch(makePayload());

    expect(request).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("swallows downstream errors so the submission is never affected", async () => {
    const error = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const request = vi
      .fn()
      .mockReturnValue(throwError(() => new Error("connection refused")));

    await expect(
      makeService({}, request).dispatch(makePayload()),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to deliver"),
      expect.anything(),
    );
    error.mockRestore();
  });

  it("treats a redirect (3xx) as a delivery failure rather than following it", async () => {
    const error = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    // With maxRedirects:0 + validateStatus:()=>true, timedPost resolves a 302 as
    // a non-2xx and raises HttpPostError — the redirect is never followed.
    const request = vi.fn().mockReturnValue(of({ status: 302 }));

    await expect(
      makeService({}, request).dispatch(makePayload()),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to deliver"),
      expect.anything(),
    );
    error.mockRestore();
  });
});
