import { joinFormPreviewUrl, formPreviewUrl } from "./form-url";

describe("joinFormPreviewUrl", () => {
  it("joins a forms-app origin with the form id", () => {
    expect(joinFormPreviewUrl("http://localhost:3000", "passport")).toBe(
      "http://localhost:3000/forms/passport",
    );
  });

  it("trims a trailing slash so the path has no double slash", () => {
    expect(joinFormPreviewUrl("http://localhost:3000/", "passport")).toBe(
      "http://localhost:3000/forms/passport",
    );
  });

  it("trims multiple trailing slashes", () => {
    expect(joinFormPreviewUrl("https://forms.gov.bb///", "birth-cert")).toBe(
      "https://forms.gov.bb/forms/birth-cert",
    );
  });

  it("falls back to the dev default when the origin is empty", () => {
    expect(joinFormPreviewUrl("", "passport")).toBe(
      "http://localhost:3000/forms/passport",
    );
  });

  it("keeps a non-default origin verbatim", () => {
    expect(joinFormPreviewUrl("https://forms.gov.bb", "birth-cert")).toBe(
      "https://forms.gov.bb/forms/birth-cert",
    );
  });
});

describe("formPreviewUrl", () => {
  // VITE_FORMS_URL is stubbed by ts-jest-mock-import-meta in jest.config.ts.
  // The empty/unset → dev-default branch is covered by joinFormPreviewUrl
  // above (import.meta replacement is static, so it can't be unset per-test).
  it("builds the link from VITE_FORMS_URL", () => {
    expect(formPreviewUrl("passport")).toBe(
      "https://forms.example.test/forms/passport",
    );
  });
});
