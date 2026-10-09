import { isSafePaymentUrl } from "./safe-payment-url";

describe("isSafePaymentUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setAllowed(value: string | undefined) {
    vi.stubEnv("VITE_PAYMENT_ALLOWED_ORIGINS", value);
  }

  // #1366: there is no baked-in default. An unset/blank allowlist fails closed
  // — every payment URL is rejected rather than trusting a hardcoded host.
  describe("fail closed when the allowlist is unset", () => {
    it("rejects an otherwise-valid host when the env var is unset", () => {
      setAllowed(undefined);
      expect(isSafePaymentUrl("https://ezpay.gov.bb/pay?token=abc")).toBe(
        false,
      );
    });

    it("rejects when the env var is an empty string", () => {
      setAllowed("");
      expect(isSafePaymentUrl("https://ezpay.gov.bb/")).toBe(false);
    });

    it("rejects when the env var is whitespace only", () => {
      setAllowed("   ");
      expect(isSafePaymentUrl("https://ezpay.gov.bb/")).toBe(false);
    });
  });

  describe("configured allowlist", () => {
    beforeEach(() => setAllowed("ezpay.gov.bb"));

    it("accepts an https URL on an allowed host", () => {
      expect(isSafePaymentUrl("https://ezpay.gov.bb/pay?token=abc")).toBe(true);
    });

    it("accepts a subdomain of an allowed host", () => {
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
    // A real allowlist is set so these prove the scheme/format checks reject
    // the URL, not merely an empty allowlist.
    beforeEach(() => setAllowed("ezpay.gov.bb"));

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
    beforeEach(() => setAllowed("ezpay.gov.bb"));

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
