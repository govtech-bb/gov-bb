import type { ExecutionContext } from "@nestjs/common";
import {
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { AdminTokenGuard } from "./admin-token.guard";

function makeContext(authHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader === undefined ? {} : { authorization: authHeader },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("AdminTokenGuard", () => {
  let guard: AdminTokenGuard;
  let savedToken: string | undefined;
  let savedKillSwitchToken: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    guard = new AdminTokenGuard();
    savedToken = process.env.ARCHIVE_DRAFTS_TOKEN;
    savedKillSwitchToken = process.env.ADMIN_KILL_SWITCH_TOKEN;
    savedNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    restore("ARCHIVE_DRAFTS_TOKEN", savedToken);
    restore("ADMIN_KILL_SWITCH_TOKEN", savedKillSwitchToken);
    restore("NODE_ENV", savedNodeEnv);
  });

  function restore(key: string, value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  describe("no token configured", () => {
    beforeEach(() => {
      delete process.env.ARCHIVE_DRAFTS_TOKEN;
    });

    it("throws 500 in production (fail closed)", () => {
      process.env.NODE_ENV = "production";
      expect(() => guard.canActivate(makeContext())).toThrow(
        InternalServerErrorException,
      );
    });

    it("passes through outside production (dev bypass)", () => {
      process.env.NODE_ENV = "development";
      expect(guard.canActivate(makeContext())).toBe(true);
    });
  });

  describe("token configured", () => {
    beforeEach(() => {
      process.env.ARCHIVE_DRAFTS_TOKEN = "s3cret";
      process.env.NODE_ENV = "production";
    });

    it("allows a request with the correct Bearer token", () => {
      expect(guard.canActivate(makeContext("Bearer s3cret"))).toBe(true);
    });

    it("accepts a case-insensitive Bearer scheme", () => {
      expect(guard.canActivate(makeContext("bearer s3cret"))).toBe(true);
    });

    it("rejects a request with no Authorization header", () => {
      expect(() => guard.canActivate(makeContext())).toThrow(
        UnauthorizedException,
      );
    });

    it("rejects an incorrect Bearer token", () => {
      expect(() => guard.canActivate(makeContext("Bearer wrong"))).toThrow(
        UnauthorizedException,
      );
    });

    it("rejects a non-Bearer Authorization scheme", () => {
      expect(() => guard.canActivate(makeContext("Basic s3cret"))).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("env var fallback (kill switch)", () => {
    let killSwitchGuard: AdminTokenGuard;

    beforeEach(() => {
      killSwitchGuard = new AdminTokenGuard(
        "ADMIN_KILL_SWITCH_TOKEN",
        "ARCHIVE_DRAFTS_TOKEN",
      );
    });

    it("prefers ADMIN_KILL_SWITCH_TOKEN once it diverges from ARCHIVE_DRAFTS_TOKEN", () => {
      process.env.ADMIN_KILL_SWITCH_TOKEN = "kill";
      process.env.ARCHIVE_DRAFTS_TOKEN = "archive";
      process.env.NODE_ENV = "production";

      expect(killSwitchGuard.canActivate(makeContext("Bearer kill"))).toBe(
        true,
      );
      expect(() =>
        killSwitchGuard.canActivate(makeContext("Bearer archive")),
      ).toThrow(UnauthorizedException);
    });

    it("falls back to ARCHIVE_DRAFTS_TOKEN when ADMIN_KILL_SWITCH_TOKEN is unset", () => {
      delete process.env.ADMIN_KILL_SWITCH_TOKEN;
      process.env.ARCHIVE_DRAFTS_TOKEN = "archive";
      process.env.NODE_ENV = "production";

      expect(killSwitchGuard.canActivate(makeContext("Bearer archive"))).toBe(
        true,
      );
    });

    it("treats an empty ADMIN_KILL_SWITCH_TOKEN as unset and falls back", () => {
      process.env.ADMIN_KILL_SWITCH_TOKEN = "";
      process.env.ARCHIVE_DRAFTS_TOKEN = "archive";
      process.env.NODE_ENV = "production";

      expect(killSwitchGuard.canActivate(makeContext("Bearer archive"))).toBe(
        true,
      );
    });

    it("throws 500 naming both vars when neither is configured in production", () => {
      delete process.env.ADMIN_KILL_SWITCH_TOKEN;
      delete process.env.ARCHIVE_DRAFTS_TOKEN;
      process.env.NODE_ENV = "production";

      expect(() => killSwitchGuard.canActivate(makeContext())).toThrow(
        new InternalServerErrorException(
          "Server misconfigured: ADMIN_KILL_SWITCH_TOKEN or ARCHIVE_DRAFTS_TOKEN required",
        ),
      );
    });

    it("passes through outside production when neither var is configured", () => {
      delete process.env.ADMIN_KILL_SWITCH_TOKEN;
      delete process.env.ARCHIVE_DRAFTS_TOKEN;
      process.env.NODE_ENV = "development";

      expect(killSwitchGuard.canActivate(makeContext())).toBe(true);
    });
  });
});
