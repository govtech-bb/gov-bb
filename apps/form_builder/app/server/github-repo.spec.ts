/**
 * @vitest-environment node
 */
import { REPO_NAME, repoOwner, repoDisplay } from "./github-repo";

afterEach(() => {
  delete process.env.GITHUB_ORG;
});

describe("REPO_NAME", () => {
  it("is the fixed repo name", () => {
    expect(REPO_NAME).toBe("gov-bb");
  });
});

describe("repoOwner", () => {
  it("returns GITHUB_ORG when set", () => {
    process.env.GITHUB_ORG = "some-org";
    expect(repoOwner()).toBe("some-org");
  });

  it("throws when GITHUB_ORG is not set", () => {
    delete process.env.GITHUB_ORG;
    expect(() => repoOwner()).toThrow("GITHUB_ORG is not set");
  });
});

describe("repoDisplay", () => {
  it("returns the env-derived owner and the repo name", () => {
    process.env.GITHUB_ORG = "some-org";
    expect(repoDisplay()).toEqual({ owner: "some-org", name: "gov-bb" });
  });

  it("returns a null owner instead of throwing when GITHUB_ORG is not set", () => {
    delete process.env.GITHUB_ORG;
    expect(repoDisplay()).toEqual({ owner: null, name: "gov-bb" });
  });
});
