import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { githubLoginFactory } from "./github-login.decorator";

function context(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("githubLoginFactory", () => {
  it("returns the login attached by the guard", () => {
    expect(
      githubLoginFactory(undefined, context({ githubLogin: "octocat" })),
    ).toBe("octocat");
  });

  it("returns an empty string when no login is present", () => {
    expect(githubLoginFactory(undefined, context({}))).toBe("");
  });
});
