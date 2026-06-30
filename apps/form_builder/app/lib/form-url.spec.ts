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
  // VITE_FORMS_URL and VITE_RECIPE_PREVIEW_TOKEN are stubbed by
  // ts-jest-mock-import-meta in vi.config.ts. The empty/unset → default
  // branches (dev-default origin, "demo" token) are covered by
  // joinFormPreviewUrl above — import.meta replacement is static, so the vars
  // can't be unset per-test.
  it("builds the link from VITE_FORMS_URL and VITE_RECIPE_PREVIEW_TOKEN", () => {
    expect(formPreviewUrl("passport")).toBe(
      "https://forms.example.test/forms/passport?draft=stub-token",
    );
  });
});
