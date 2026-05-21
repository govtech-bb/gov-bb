import { isSessionValid } from "./session-types";

describe("isSessionValid", () => {
  it("returns false for undefined session data", () => {
    expect(isSessionValid(undefined)).toBe(false);
  });

  it("returns false for empty session data", () => {
    expect(isSessionValid({})).toBe(false);
  });

  it("returns false when accessToken is missing", () => {
    expect(
      isSessionValid({
        githubLogin: "alice",
        teamMemberships: [],
        expiresAt: Date.now() + 60_000,
      }),
    ).toBe(false);
  });

  it("returns false when githubLogin is missing", () => {
    expect(
      isSessionValid({
        accessToken: "tok",
        teamMemberships: [],
        expiresAt: Date.now() + 60_000,
      }),
    ).toBe(false);
  });

  it("returns false when expiresAt is in the past", () => {
    expect(
      isSessionValid({
        githubLogin: "alice",
        accessToken: "tok",
        teamMemberships: [],
        expiresAt: Date.now() - 1_000,
      }),
    ).toBe(false);
  });

  it("returns false when expiresAt is missing", () => {
    expect(
      isSessionValid({
        githubLogin: "alice",
        accessToken: "tok",
        teamMemberships: [],
      }),
    ).toBe(false);
  });

  it("returns true for a complete, unexpired session", () => {
    expect(
      isSessionValid({
        githubLogin: "alice",
        accessToken: "tok",
        teamMemberships: ["publishers"],
        expiresAt: Date.now() + 60_000,
      }),
    ).toBe(true);
  });
});
