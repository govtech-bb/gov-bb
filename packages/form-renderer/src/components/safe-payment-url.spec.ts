import {
  DEFAULT_ALLOWED_PAYMENT_ORIGINS,
  isSafePaymentUrl,
} from "./safe-payment-url";

// The predicate is env-free: the allowlist is passed in (the host resolves it
// from VITE_PAYMENT_ALLOWED_ORIGINS and threads it via `allowedPaymentOrigins`
// — see apps/forms getAllowedPaymentOrigins + its spec). These cases restore
// the scheme/host/malformed edge-case coverage that predated the extraction
// (#1504), exercising the predicate directly rather than through a render.
describe("isSafePaymentUrl", () => {
  describe("default allowlist (ezpay.gov.bb)", () => {
    const allowed = DEFAULT_ALLOWED_PAYMENT_ORIGINS;

    it("accepts an https URL on the default host", () => {
      expect(
        isSafePaymentUrl("https://ezpay.gov.bb/pay?token=abc", allowed),
      ).toBe(true);
    });

    it("accepts a subdomain of the default host", () => {
      expect(isSafePaymentUrl("https://test.ezpay.gov.bb/pay", allowed)).toBe(
        true,
      );
    });

    it("rejects a different origin", () => {
      expect(isSafePaymentUrl("https://attacker.example/", allowed)).toBe(
        false,
      );
    });

    it("rejects a host that merely contains the allowed string", () => {
      expect(isSafePaymentUrl("https://evilezpay.gov.bb/", allowed)).toBe(
        false,
      );
    });

    it("rejects a lookalike with the allowed host as a path", () => {
      expect(
        isSafePaymentUrl("https://attacker.example/ezpay.gov.bb", allowed),
      ).toBe(false);
    });
  });

  describe("dangerous schemes", () => {
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
      expect(isSafePaymentUrl(input, DEFAULT_ALLOWED_PAYMENT_ORIGINS)).toBe(
        false,
      );
    });
  });

  describe("malformed input", () => {
    it.each([undefined, null, "", "   ", "not a url", "https://"])(
      "rejects %p",
      (input) => {
        expect(
          isSafePaymentUrl(
            input as string | null | undefined,
            DEFAULT_ALLOWED_PAYMENT_ORIGINS,
          ),
        ).toBe(false);
      },
    );
  });

  describe("custom allowlist", () => {
    it("accepts hosts from the supplied allowlist", () => {
      const allowed = ["pay.example.com", "alt.example.com"];
      expect(isSafePaymentUrl("https://pay.example.com/", allowed)).toBe(true);
      expect(isSafePaymentUrl("https://alt.example.com/x", allowed)).toBe(true);
    });

    it("rejects hosts not in the supplied allowlist", () => {
      expect(
        isSafePaymentUrl("https://ezpay.gov.bb/", ["pay.example.com"]),
      ).toBe(false);
    });

    it("matches case-insensitively on host", () => {
      expect(
        isSafePaymentUrl("https://PAY.EXAMPLE.COM/", ["pay.example.com"]),
      ).toBe(true);
    });
  });
});
