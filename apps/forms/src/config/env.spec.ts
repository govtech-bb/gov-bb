import { requireEnv } from "./env";

describe("requireEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the configured value, trimmed", () => {
    expect(
      requireEnv("  https://alpha.gov.bb  ", "VITE_LANDING_URL", "dev"),
    ).toBe("https://alpha.gov.bb");
  });

  it("falls back to the dev default when unset in a dev build", () => {
    vi.stubEnv("DEV", true);
    expect(requireEnv(undefined, "VITE_API_URL", "http://localhost:3001")).toBe(
      "http://localhost:3001",
    );
    expect(requireEnv("", "VITE_API_URL", "http://localhost:3001")).toBe(
      "http://localhost:3001",
    );
  });

  it("throws (fails fast) when unset in a production build", () => {
    vi.stubEnv("DEV", false);
    expect(() => requireEnv(undefined, "VITE_API_URL", "dev")).toThrow(
      /VITE_API_URL/,
    );
    expect(() => requireEnv("   ", "VITE_API_URL", "dev")).toThrow();
  });

  it("returns the value in production when it is set", () => {
    vi.stubEnv("DEV", false);
    expect(
      requireEnv("https://forms.api.alpha.gov.bb", "VITE_API_URL", "dev"),
    ).toBe("https://forms.api.alpha.gov.bb");
  });
});
