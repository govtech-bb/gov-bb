import { joinFormPreviewUrl, formPreviewUrl } from "./form-url";

describe("joinFormPreviewUrl", () => {
  it("joins a forms-app origin with the form id and draft token", () => {
    expect(
      joinFormPreviewUrl("http://localhost:3000", "passport", "demo"),
    ).toBe("http://localhost:3000/forms/passport?draft=demo");
  });

  it("trims a trailing slash so the path has no double slash", () => {
    expect(
      joinFormPreviewUrl("http://localhost:3000/", "passport", "demo"),
    ).toBe("http://localhost:3000/forms/passport?draft=demo");
  });

  it("trims multiple trailing slashes", () => {
    expect(
      joinFormPreviewUrl("https://forms.gov.bb///", "birth-cert", "demo"),
    ).toBe("https://forms.gov.bb/forms/birth-cert?draft=demo");
  });

  it("falls back to the dev default when the origin is empty", () => {
    expect(joinFormPreviewUrl("", "passport", "demo")).toBe(
      "http://localhost:3000/forms/passport?draft=demo",
    );
  });

  it("keeps a non-default origin verbatim", () => {
    expect(
      joinFormPreviewUrl("https://forms.gov.bb", "birth-cert", "demo"),
    ).toBe("https://forms.gov.bb/forms/birth-cert?draft=demo");
  });

  it("URL-encodes a token containing metacharacters", () => {
    expect(
      joinFormPreviewUrl("https://forms.gov.bb", "passport", "a b&c=d/e"),
    ).toBe("https://forms.gov.bb/forms/passport?draft=a%20b%26c%3Dd%2Fe");
  });
});

describe("formPreviewUrl", () => {
  // VITE_FORMS_URL and VITE_RECIPE_PREVIEW_TOKEN come from the vitest `test.env`
  // config (forms.example.test / stub-token); `vi.stubEnv` overrides them
  // per-test.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the link from VITE_FORMS_URL and VITE_RECIPE_PREVIEW_TOKEN", () => {
    expect(formPreviewUrl("passport")).toBe(
      "https://forms.example.test/forms/passport?draft=stub-token",
    );
  });

  it("fails closed with an empty token when VITE_RECIPE_PREVIEW_TOKEN is unset (#1366)", () => {
    vi.stubEnv("VITE_RECIPE_PREVIEW_TOKEN", "");
    // No guessable "demo" fallback — the token is empty, so no preview matches.
    expect(formPreviewUrl("passport")).toBe(
      "https://forms.example.test/forms/passport?preview=",
    );
  });
});
