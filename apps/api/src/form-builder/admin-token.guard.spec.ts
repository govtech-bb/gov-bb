import { HttpException, HttpStatus } from "@nestjs/common";
import { AdminTokenGuard, ADMIN_TOKEN_HEADER } from "./admin-token.guard";

describe("AdminTokenGuard", () => {
  const VALID_TOKEN = "a".repeat(32);

  const makeCtx = (headerValue?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) =>
            name.toLowerCase() === ADMIN_TOKEN_HEADER ? headerValue : undefined,
        }),
      }),
    }) as never;

  const makeGuard = (envToken?: string) => {
    const config = { get: jest.fn().mockReturnValue(envToken) };
    return new AdminTokenGuard(config as never);
  };

  it("throws 503 when ADMIN_API_TOKEN is not configured", () => {
    const guard = makeGuard(undefined);
    try {
      guard.canActivate(makeCtx(VALID_TOKEN));
      fail("expected canActivate to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  });

  it("throws 401 when the X-Admin-Token header is missing", () => {
    const guard = makeGuard(VALID_TOKEN);
    try {
      guard.canActivate(makeCtx(undefined));
      fail("expected canActivate to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it("throws 401 when the token is the wrong length", () => {
    const guard = makeGuard(VALID_TOKEN);
    try {
      guard.canActivate(makeCtx("a".repeat(31)));
      fail("expected canActivate to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it("throws 401 when the token is the right length but wrong content", () => {
    const guard = makeGuard(VALID_TOKEN);
    try {
      guard.canActivate(makeCtx("b".repeat(32)));
      fail("expected canActivate to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it("returns true when the token matches exactly", () => {
    const guard = makeGuard(VALID_TOKEN);
    expect(guard.canActivate(makeCtx(VALID_TOKEN))).toBe(true);
  });
});
