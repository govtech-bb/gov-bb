import { isAuthorized } from "./github-oauth";

describe("isAuthorized", () => {
  it("allows any authenticated GitHub user in local dev", () => {
    expect(
      isAuthorized({ isDev: true, isTeamMember: false, hasRepoWrite: false }),
    ).toBe(true);
  });

  it("requires team membership or repo write when deployed", () => {
    expect(
      isAuthorized({ isDev: false, isTeamMember: true, hasRepoWrite: false }),
    ).toBe(true);
    expect(
      isAuthorized({ isDev: false, isTeamMember: false, hasRepoWrite: true }),
    ).toBe(true);
    expect(
      isAuthorized({ isDev: false, isTeamMember: false, hasRepoWrite: false }),
    ).toBe(false);
  });
});
