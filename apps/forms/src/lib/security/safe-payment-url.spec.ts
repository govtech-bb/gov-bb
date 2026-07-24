import { getAllowedPaymentOrigins } from "./safe-payment-url";

// The URL-safety check itself moved to @govtech-bb/form-renderer's
// SubmissionConfirmation (env-free) — see that package's
// submission-confirmation.spec.tsx for coverage of the https/scheme/host
// matching behaviour. This app-side helper only resolves the env-driven
// allowlist that gets threaded through as `allowedPaymentOrigins`.
describe("getAllowedPaymentOrigins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setAllowed(value: string | undefined) {
    vi.stubEnv("VITE_PAYMENT_ALLOWED_ORIGINS", value);
  }

  it("falls back to the default allowlist when env is unset", () => {
    setAllowed(undefined);
    expect(getAllowedPaymentOrigins()).toEqual(["ezpay.gov.bb"]);
  });

  it("falls back to the default allowlist when env is whitespace only", () => {
    setAllowed("   ");
    expect(getAllowedPaymentOrigins()).toEqual(["ezpay.gov.bb"]);
  });

  it("parses a comma-separated allowlist from env", () => {
    setAllowed("pay.example.com, alt.example.com");
    expect(getAllowedPaymentOrigins()).toEqual([
      "pay.example.com",
      "alt.example.com",
    ]);
  });

  it("lowercases hosts from env", () => {
    setAllowed("PAY.EXAMPLE.COM");
    expect(getAllowedPaymentOrigins()).toEqual(["pay.example.com"]);
  });

  // safe-payment-url.ts reads `import.meta.env.VITE_PAYMENT_ALLOWED_ORIGINS`,
  // which Vite statically replaces at build time for the browser bundle. Under
  // Vitest, `vi.stubEnv` drives that same `import.meta.env` value, so this
  // test exercises the real production lookup path (#1504).
  it("honours an allowlist supplied through import.meta.env", () => {
    vi.stubEnv("VITE_PAYMENT_ALLOWED_ORIGINS", "pay.example.com");
    expect(import.meta.env.VITE_PAYMENT_ALLOWED_ORIGINS).toBe(
      "pay.example.com",
    );
    expect(getAllowedPaymentOrigins()).toEqual(["pay.example.com"]);
  });
});
