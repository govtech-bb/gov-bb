import { requireEnv } from "./env";

describe("requireEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the configured value, trimmed", () => {
    expect(
      requireEnv("  https://forms.alpha.gov.bb  ", "VITE_FORMS_URL", "dev"),
    ).toBe("https://forms.alpha.gov.bb");
  });

  it("falls back to the dev default when unset in a dev build", () => {
    vi.stubEnv("DEV", true);
    expect(
      requireEnv(undefined, "VITE_FORMS_URL", "http://localhost:3000"),
    ).toBe("http://localhost:3000");
    expect(requireEnv("", "VITE_FORMS_URL", "http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("throws (fails fast) when unset in a production build", () => {
    vi.stubEnv("DEV", false);
    expect(() => requireEnv(undefined, "VITE_FORMS_URL", "dev")).toThrow(
      /VITE_FORMS_URL/,
    );
    expect(() => requireEnv("  ", "VITE_FORMS_URL", "dev")).toThrow();
  });

  it("returns the value in production when it is set", () => {
    vi.stubEnv("DEV", false);
    expect(
      requireEnv("https://forms.alpha.gov.bb", "VITE_FORMS_URL", "dev"),
    ).toBe("https://forms.alpha.gov.bb");
  });
});
