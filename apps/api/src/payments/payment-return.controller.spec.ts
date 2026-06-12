import { PaymentReturnController } from "./payment-return.controller";

describe("PaymentReturnController", () => {
  const service = { confirmReturn: vi.fn() };

  const makeController = (env: Record<string, string | undefined>) => {
    const config = { get: vi.fn((k: string) => env[k]) };
    return new PaymentReturnController(service as never, config as never);
  };

  beforeEach(() => vi.clearAllMocks());

  it("confirms the payment and redirects to the form's confirmation page on success", async () => {
    service.confirmReturn.mockResolvedValue({
      outcome: "success",
      formId: "get-birth-certificate",
    });
    const ctl = makeController({ FORMS_BASE_URL: "https://forms.example.gov" });

    const result = await ctl.ezpayReturn("ref-uuid", "TXN-9", "Success");

    expect(service.confirmReturn).toHaveBeenCalledWith({
      reference: "ref-uuid",
      transactionNumber: "TXN-9",
    });
    expect(result.url).toBe(
      "https://forms.example.gov/forms/get-birth-certificate/?step=submission-confirmation&payment=success",
    );
  });

  it("redirects with payment=failed on a failed outcome", async () => {
    service.confirmReturn.mockResolvedValue({
      outcome: "failed",
      formId: "get-birth-certificate",
    });
    const ctl = makeController({ FORMS_BASE_URL: "https://forms.example.gov" });

    const result = await ctl.ezpayReturn("ref-uuid", "TXN-9", "Failed");

    expect(result.url).toBe(
      "https://forms.example.gov/forms/get-birth-certificate/?step=submission-confirmation&payment=failed",
    );
  });

  it("omits the payment param on a still-pending outcome (keeps stored payment state)", async () => {
    service.confirmReturn.mockResolvedValue({
      outcome: "pending",
      formId: "get-birth-certificate",
    });
    const ctl = makeController({ FORMS_BASE_URL: "https://forms.example.gov" });

    const result = await ctl.ezpayReturn("ref-uuid", undefined, "Initiated");

    expect(result.url).toBe(
      "https://forms.example.gov/forms/get-birth-certificate/?step=submission-confirmation",
    );
  });

  it("falls back to the first CORS_ORIGIN when FORMS_BASE_URL is unset", async () => {
    service.confirmReturn.mockResolvedValue({
      outcome: "success",
      formId: "passport",
    });
    const ctl = makeController({
      FORMS_BASE_URL: "",
      CORS_ORIGIN: "https://forms.sandbox.gov, https://builder.sandbox.gov",
    });

    const result = await ctl.ezpayReturn("ref-uuid", "TXN-1", "Success");

    expect(result.url).toBe(
      "https://forms.sandbox.gov/forms/passport/?step=submission-confirmation&payment=success",
    );
  });

  it("accepts the underscore-style param names (_reference/_transaction_number)", async () => {
    service.confirmReturn.mockResolvedValue({
      outcome: "success",
      formId: "passport",
    });
    const ctl = makeController({ FORMS_BASE_URL: "https://forms.example.gov" });

    await ctl.ezpayReturn(
      undefined,
      undefined,
      "Success",
      "ref-underscore",
      "TXN-underscore",
    );

    expect(service.confirmReturn).toHaveBeenCalledWith({
      reference: "ref-underscore",
      transactionNumber: "TXN-underscore",
    });
  });

  it("redirects to the site root when no reference is supplied (no service call)", async () => {
    const ctl = makeController({ FORMS_BASE_URL: "https://forms.example.gov" });

    const result = await ctl.ezpayReturn(undefined, undefined, undefined);

    expect(service.confirmReturn).not.toHaveBeenCalled();
    expect(result.url).toBe("https://forms.example.gov");
  });

  it("redirects to the site root when the reference doesn't resolve to a form", async () => {
    service.confirmReturn.mockResolvedValue({
      outcome: "not_found",
      formId: undefined,
    });
    const ctl = makeController({ FORMS_BASE_URL: "https://forms.example.gov" });

    const result = await ctl.ezpayReturn("unknown-ref", "TXN-1", "Success");

    expect(result.url).toBe("https://forms.example.gov");
  });

  it("does not throw when confirmation errors — lands the citizen on the confirmation step", async () => {
    service.confirmReturn.mockRejectedValue(new Error("check_api down"));
    const ctl = makeController({ FORMS_BASE_URL: "https://forms.example.gov" });

    // formId is unknown on error, so we can only send them to the site root —
    // but the call must resolve, never reject.
    const result = await ctl.ezpayReturn("ref-uuid", "TXN-1", "Success");

    expect(result.url).toBe("https://forms.example.gov");
  });
});
