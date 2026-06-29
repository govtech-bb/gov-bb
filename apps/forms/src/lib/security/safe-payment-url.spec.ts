import { isSafePaymentUrl } from "./safe-payment-url";

describe("isSafePaymentUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setAllowed(value: string | undefined) {
    vi.stubEnv("VITE_PAYMENT_ALLOWED_ORIGINS", value);
  }

  describe("default allowlist (ezpay.gov.bb)", () => {
    beforeEach(() => setAllowed(undefined));

    it("accepts an https URL on the default host", () => {
      expect(isSafePaymentUrl("https://ezpay.gov.bb/pay?token=abc")).toBe(true);
    });

    it("accepts a subdomain of the default host", () => {
      expect(isSafePaymentUrl("https://test.ezpay.gov.bb/pay")).toBe(true);
    });

    it("rejects a different origin", () => {
      expect(isSafePaymentUrl("https://attacker.example/")).toBe(false);
    });

    it("rejects a host that merely contains the allowed string", () => {
      expect(isSafePaymentUrl("https://evilezpay.gov.bb/")).toBe(false);
    });

    it("rejects a lookalike with the allowed host as a path", () => {
      expect(isSafePaymentUrl("https://attacker.example/ezpay.gov.bb")).toBe(
        false,
      );
    });
  });

  describe("dangerous schemes", () => {
    beforeEach(() => setAllowed(undefined));

    it.each([
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "blob:https://ezpay.gov.bb/abc",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://ezpay.gov.bb/",
      "http://ezpay.gov.bb/",
    ])("rejects %s", (input) => {
      expect(isSafePaymentUrl(input)).toBe(false);
    });
  });

  describe("malformed input", () => {
    it.each([undefined, null, "", "   ", "not a url", "https://"])(
      "rejects %p",
      (input) => {
        expect(isSafePaymentUrl(input as string | null | undefined)).toBe(
          false,
        );
      },
    );
  });

  // safe-payment-url.ts reads `import.meta.env.VITE_PAYMENT_ALLOWED_ORIGINS`,
  // which Vite statically replaces at build time for the browser bundle. Under
  // Vitest, `vi.stubEnv` drives that same `import.meta.env` value, so these
  // tests exercise the real production lookup path (#1504).
  describe("custom allowlist via env", () => {
    it("accepts hosts from a comma-separated allowlist", () => {
      setAllowed("pay.example.com, alt.example.com");
      expect(isSafePaymentUrl("https://pay.example.com/")).toBe(true);
      expect(isSafePaymentUrl("https://alt.example.com/x")).toBe(true);
    });

    it("rejects hosts not in the custom allowlist", () => {
      setAllowed("pay.example.com");
      expect(isSafePaymentUrl("https://ezpay.gov.bb/")).toBe(false);
    });

    it("falls back to defaults when env is whitespace only", () => {
      setAllowed("   ");
      expect(isSafePaymentUrl("https://ezpay.gov.bb/")).toBe(true);
    });

    it("matches case-insensitively on host", () => {
      setAllowed("pay.example.com");
      expect(isSafePaymentUrl("https://PAY.EXAMPLE.COM/")).toBe(true);
    });
  });

  describe("via import.meta.env (Vite build-time replacement)", () => {
    it("honours an allowlist supplied through import.meta.env", () => {
      vi.stubEnv("VITE_PAYMENT_ALLOWED_ORIGINS", "pay.example.com");
      expect(import.meta.env.VITE_PAYMENT_ALLOWED_ORIGINS).toBe(
        "pay.example.com",
      );
      expect(isSafePaymentUrl("https://pay.example.com/")).toBe(true);
      expect(isSafePaymentUrl("https://ezpay.gov.bb/")).toBe(false);
    });
  });
});
