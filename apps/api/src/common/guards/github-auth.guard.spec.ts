import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubAuthGuard } from "./github-auth.guard";

describe("GitHubAuthGuard", () => {
  const guard = new GitHubAuthGuard();
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
    vi.unstubAllGlobals();
  });

  function context(authorization?: string) {
    const req: { headers: { authorization?: string }; githubLogin?: string } = {
      headers: { authorization },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { ctx, req };
  }

  it("throws Unauthorized when the bearer token is missing", async () => {
    const { ctx } = context(undefined);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("throws Forbidden when the token is not authorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({}),
        } as Response),
      ),
    );
    const { ctx } = context("Bearer bad");
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("attaches the verified login and allows the request", async () => {
    process.env.NODE_ENV = "development";
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ login: "octocat" }),
        } as Response),
      ),
    );
    const { ctx, req } = context("Bearer good");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.githubLogin).toBe("octocat");
  });
});
