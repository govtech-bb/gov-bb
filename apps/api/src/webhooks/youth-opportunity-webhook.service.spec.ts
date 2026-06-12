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

function makeService(config: Partial<WebhooksConfig>, post: Mock) {
  const http = { post } as unknown as ConstructorParameters<
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
  it("posts the frontend-alpha payload shape to /api/webhooks/form-submitted", async () => {
    const post = vi.fn().mockReturnValue(of({ status: 200 }));
    await makeService({}, post).dispatch(makePayload());

    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe(
      "https://cases.example.gov.bb/api/webhooks/form-submitted",
    );
    expect(body).toEqual({
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
    expect(options.headers["X-API-Key"]).toBe("shared-secret");
    expect(options.timeout).toBe(10_000);
  });

  it("resolves the endpoint when the base URL has a trailing slash", async () => {
    const post = vi.fn().mockReturnValue(of({ status: 200 }));
    await makeService({ url: "https://cases.example.gov.bb/" }, post).dispatch(
      makePayload(),
    );
    expect(post.mock.calls[0][0]).toBe(
      "https://cases.example.gov.bb/api/webhooks/form-submitted",
    );
  });

  it("skips dispatch (and warns) when url or secret is missing", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const post = vi.fn();
    await makeService({ url: "" }, post).dispatch(makePayload());
    await makeService({ secret: "" }, post).dispatch(makePayload());

    expect(post).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("swallows downstream errors so the submission is never affected", async () => {
    const error = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const post = vi
      .fn()
      .mockReturnValue(throwError(() => new Error("connection refused")));

    await expect(
      makeService({}, post).dispatch(makePayload()),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to deliver"),
      expect.anything(),
    );
    error.mockRestore();
  });
});
