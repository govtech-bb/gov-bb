import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { AdminTokenGuard } from "./admin-token.guard";

// Minimal ConfigService stub: returns configured env values, falling back to
// the default `get` is called with (matching ConfigService's signature).
function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, def?: string) => values[key] ?? def,
  } as unknown as ConfigService;
}

// Minimal ExecutionContext exposing only the request headers the guard reads.
function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe("AdminTokenGuard", () => {
  it("allows a request whose x-admin-token matches ADMIN_API_TOKEN", () => {
    const guard = new AdminTokenGuard(
      makeConfig({ ADMIN_API_TOKEN: "s3cret", NODE_ENV: "production" }),
    );
    expect(guard.canActivate(makeContext({ "x-admin-token": "s3cret" }))).toBe(
      true,
    );
  });

  it("rejects a wrong token with 403", () => {
    const guard = new AdminTokenGuard(
      makeConfig({ ADMIN_API_TOKEN: "s3cret", NODE_ENV: "production" }),
    );
    expect(() =>
      guard.canActivate(makeContext({ "x-admin-token": "wrong" })),
    ).toThrow(ForbiddenException);
  });

  it("rejects a missing header with 401 when a token is configured", () => {
    const guard = new AdminTokenGuard(
      makeConfig({ ADMIN_API_TOKEN: "s3cret", NODE_ENV: "production" }),
    );
    expect(() => guard.canActivate(makeContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it("passes through when ADMIN_API_TOKEN is unset outside production", () => {
    const guard = new AdminTokenGuard(makeConfig({ NODE_ENV: "development" }));
    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it("fails closed (500) when ADMIN_API_TOKEN is unset in production", () => {
    const guard = new AdminTokenGuard(makeConfig({ NODE_ENV: "production" }));
    expect(() => guard.canActivate(makeContext({}))).toThrow(
      InternalServerErrorException,
    );
  });
});
