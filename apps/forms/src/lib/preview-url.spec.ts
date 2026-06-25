import { describe, expect, it } from "vitest";
import {
  canDropPreviewToken,
  registrableDomain,
  sharesSite,
} from "./preview-url";

describe("registrableDomain", () => {
  it("returns the last two labels of a multi-label host", () => {
    expect(registrableDomain("forms.sandbox.alpha.gov.bb")).toBe("gov.bb");
    expect(registrableDomain("forms.api.sandbox.alpha.gov.bb")).toBe("gov.bb");
    expect(registrableDomain("branch.d123.amplifyapp.com")).toBe(
      "amplifyapp.com",
    );
  });

  it("returns a single-label host unchanged", () => {
    expect(registrableDomain("localhost")).toBe("localhost");
  });
});

describe("sharesSite", () => {
  it("is true for two subdomains of the same registrable domain", () => {
    expect(
      sharesSite(
        "forms.sandbox.alpha.gov.bb",
        "forms.api.sandbox.alpha.gov.bb",
      ),
    ).toBe(true);
    expect(sharesSite("forms.alpha.gov.bb", "forms.api.alpha.gov.bb")).toBe(
      true,
    );
  });

  it("is true for identical localhost hosts", () => {
    expect(sharesSite("localhost", "localhost")).toBe(true);
  });

  it("is false across different registrable domains (preview vs API)", () => {
    expect(
      sharesSite(
        "branch.d123.amplifyapp.com",
        "forms.api.sandbox.alpha.gov.bb",
      ),
    ).toBe(false);
  });
});

// canDropPreviewToken composes sharesSite with the build-time API host. Under
// test VITE_API_URL is unset, so it defaults to http://localhost:3001.
describe("canDropPreviewToken (API host = localhost)", () => {
  it("allows dropping the token when the page is same-site as the API", () => {
    expect(canDropPreviewToken("localhost")).toBe(true);
  });

  it("keeps the token when the page is cross-site (Amplify preview)", () => {
    expect(canDropPreviewToken("branch.d123.amplifyapp.com")).toBe(false);
  });
});
