import { resolveTokenAuth } from "./resolve-token-auth";

// Mirrors apps/api/src/common/resolve-token-auth.spec.ts — the two copies of
// the dev-bypass policy must behave identically (ADR 0061).
describe("resolveTokenAuth", () => {
  describe("no secret configured", () => {
    it("fails closed in production (misconfigured)", () => {
      expect(
        resolveTokenAuth({ presented: undefined, expected: "", isProd: true }),
      ).toBe("misconfigured");
      expect(
        resolveTokenAuth({
          presented: "anything",
          expected: undefined,
          isProd: true,
        }),
      ).toBe("misconfigured");
    });

    it("passes through outside production (dev bypass)", () => {
      expect(
        resolveTokenAuth({ presented: undefined, expected: "", isProd: false }),
      ).toBe("passthrough");
      expect(
        resolveTokenAuth({
          presented: undefined,
          expected: undefined,
          isProd: false,
        }),
      ).toBe("passthrough");
    });
  });

  describe("secret configured", () => {
    it("returns ok when the presented token matches", () => {
      expect(
        resolveTokenAuth({
          presented: "s3cret",
          expected: "s3cret",
          isProd: true,
        }),
      ).toBe("ok");
    });

    it("returns denied when the presented token is absent", () => {
      expect(
        resolveTokenAuth({
          presented: undefined,
          expected: "s3cret",
          isProd: true,
        }),
      ).toBe("denied");
      expect(
        resolveTokenAuth({ presented: "", expected: "s3cret", isProd: false }),
      ).toBe("denied");
    });

    it("returns denied when the presented token does not match", () => {
      expect(
        resolveTokenAuth({
          presented: "wrong",
          expected: "s3cret",
          isProd: false,
        }),
      ).toBe("denied");
    });
  });
});
