import { isSafePaymentUrl } from "./safe-payment-url";

describe("isSafePaymentUrl", () => {
  const originalValue = process.env.VITE_PAYMENT_ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.VITE_PAYMENT_ALLOWED_ORIGINS;
    } else {
      process.env.VITE_PAYMENT_ALLOWED_ORIGINS = originalValue;
    }
  });

  function setAllowed(value: string | undefined) {
    if (value === undefined) {
      delete process.env.VITE_PAYMENT_ALLOWED_ORIGINS;
    } else {
      process.env.VITE_PAYMENT_ALLOWED_ORIGINS = value;
    }
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

  // NOTE: production env-var gap.
  // safe-payment-url.ts reads `process.env.VITE_PAYMENT_ALLOWED_ORIGINS` via
  // `typeof process !== "undefined" ? process.env?.VITE_PAYMENT_ALLOWED_ORIGINS : undefined`.
  // Vite only inlines `import.meta.env.VITE_*` for browser bundles; `process` is
  // undefined at runtime in the browser, so the guard always short-circuits to
  // undefined and the allowlist override is silently ignored in production.
  // These tests pass under Jest (Node) only because Node provides `process`.
  // Source fix tracked separately — once the source reads `import.meta.env`,
  // the `via env (Vite)` describe below should be un-skipped and updated to
  // poke the equivalent build-time replacement.
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

  // eslint-disable-next-line jest/no-disabled-tests
  describe.skip("via env (Vite) — un-skip when source reads import.meta.env", () => {
    it("honours the configured allowlist in a browser-like environment without `process`", () => {
      // Skipped: Jest provides `process`, so we cannot reliably reproduce the
      // production behaviour where `process` is undefined and the override is
      // dropped at build time. Once safe-payment-url.ts reads
      // `import.meta.env.VITE_PAYMENT_ALLOWED_ORIGINS`, replace this with a
      // test that stubs `import.meta.env` directly.
      expect(true).toBe(true);
    });
  });
});
