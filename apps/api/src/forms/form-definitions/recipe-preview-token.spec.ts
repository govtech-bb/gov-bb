import { isValidPreviewToken } from "./recipe-preview-token";

describe("isValidPreviewToken", () => {
  describe("fail-closed when configuredToken is empty/falsy", () => {
    it("returns false when configuredToken is empty string, even if providedToken matches", () => {
      expect(isValidPreviewToken("", "")).toBe(false);
    });

    it("returns false when configuredToken is empty and providedToken is non-empty", () => {
      expect(isValidPreviewToken("", "sometoken")).toBe(false);
    });

    it("does NOT allow empty-string === empty-string match", () => {
      // This is the critical fail-closed requirement: no "" === "" match.
      expect(isValidPreviewToken("", "")).toBe(false);
    });
  });

  describe("fail-closed when providedToken is absent or empty", () => {
    it("returns false when providedToken is undefined", () => {
      expect(isValidPreviewToken("s3cret", undefined)).toBe(false);
    });

    it("returns false when providedToken is empty string", () => {
      expect(isValidPreviewToken("s3cret", "")).toBe(false);
    });
  });

  describe("correct token comparison via SHA-256 digests", () => {
    it("returns true when tokens match", () => {
      expect(isValidPreviewToken("s3cret", "s3cret")).toBe(true);
    });

    it("returns false when tokens differ", () => {
      expect(isValidPreviewToken("s3cret", "wrong")).toBe(false);
    });

    it("returns false when tokens differ by case", () => {
      expect(isValidPreviewToken("s3cret", "S3cret")).toBe(false);
    });

    it("handles different-length tokens without throwing", () => {
      // Short vs long token — timingSafeEqual on raw buffers would throw if
      // lengths differ; using SHA-256 digests (always 32 bytes) prevents that.
      expect(() =>
        isValidPreviewToken("short", "a-much-longer-token-value"),
      ).not.toThrow();
      expect(isValidPreviewToken("short", "a-much-longer-token-value")).toBe(
        false,
      );
    });

    it("handles long tokens without throwing", () => {
      const longToken = "a".repeat(512);
      expect(() => isValidPreviewToken(longToken, longToken)).not.toThrow();
      expect(isValidPreviewToken(longToken, longToken)).toBe(true);
    });
  });
});
