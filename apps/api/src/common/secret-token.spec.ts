import { isValidSecretToken } from "./secret-token";

describe("isValidSecretToken", () => {
  describe("fail-closed when configuredToken is empty/falsy", () => {
    it("returns false when configuredToken is empty string, even if providedToken matches", () => {
      expect(isValidSecretToken("", "")).toBe(false);
    });

    it("returns false when configuredToken is empty and providedToken is non-empty", () => {
      expect(isValidSecretToken("", "sometoken")).toBe(false);
    });

    it("does NOT allow empty-string === empty-string match", () => {
      // This is the critical fail-closed requirement: no "" === "" match.
      expect(isValidSecretToken("", "")).toBe(false);
    });
  });

  describe("fail-closed when providedToken is absent or empty", () => {
    it("returns false when providedToken is undefined", () => {
      expect(isValidSecretToken("s3cret", undefined)).toBe(false);
    });

    it("returns false when providedToken is empty string", () => {
      expect(isValidSecretToken("s3cret", "")).toBe(false);
    });
  });

  describe("correct token comparison via HMAC digests", () => {
    it("returns true when tokens match", () => {
      expect(isValidSecretToken("s3cret", "s3cret")).toBe(true);
    });

    it("returns false when tokens differ", () => {
      expect(isValidSecretToken("s3cret", "wrong")).toBe(false);
    });

    it("returns false when tokens differ by case", () => {
      expect(isValidSecretToken("s3cret", "S3cret")).toBe(false);
    });

    it("handles different-length tokens without throwing", () => {
      // Short vs long token — timingSafeEqual on raw buffers would throw if
      // lengths differ; HMAC digests (always 32 bytes) prevent that.
      expect(() =>
        isValidSecretToken("short", "a-much-longer-token-value"),
      ).not.toThrow();
      expect(isValidSecretToken("short", "a-much-longer-token-value")).toBe(
        false,
      );
    });

    it("handles long tokens without throwing", () => {
      const longToken = "a".repeat(512);
      expect(() => isValidSecretToken(longToken, longToken)).not.toThrow();
      expect(isValidSecretToken(longToken, longToken)).toBe(true);
    });
  });
});
