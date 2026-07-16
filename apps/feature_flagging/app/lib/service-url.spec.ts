import { buildServiceUrl, serviceUrl } from "./service-url";
import type { ServiceRow } from "./catalogue";

const row = (over: Partial<ServiceRow>): ServiceRow => ({
  slug: "some-service",
  title: "Some service",
  hasForm: false,
  status: "enabled",
  ...over,
});

describe("buildServiceUrl", () => {
  it("links a service with a landing page to its content page", () => {
    expect(
      buildServiceUrl(
        row({
          slug: "get-birth-certificate",
          hasForm: true,
          landingUrl: "family-birth-relationships/get-birth-certificate",
        }),
        "https://alpha.gov.bb",
        "https://forms.alpha.gov.bb",
      ),
    ).toBe(
      "https://alpha.gov.bb/family-birth-relationships/get-birth-certificate",
    );
  });

  it("links a form-only service to the form on the forms app", () => {
    expect(
      buildServiceUrl(
        row({ slug: "some-form", hasForm: true }),
        "https://alpha.gov.bb",
        "https://forms.alpha.gov.bb",
      ),
    ).toBe("https://forms.alpha.gov.bb/forms/some-form");
  });

  it("returns null for an orphan (no landing page, no form)", () => {
    expect(
      buildServiceUrl(
        row({ orphan: true }),
        "https://alpha.gov.bb",
        "https://forms.alpha.gov.bb",
      ),
    ).toBeNull();
  });
});

describe("serviceUrl", () => {
  // No LANDING_URL/FORMS_URL baked in the test env → localhost defaults, so a
  // link built against a local run stays on localhost.
  it("defaults to the local landing origin for a content page", () => {
    expect(serviceUrl(row({ hasForm: true, landingUrl: "passport" }))).toBe(
      "http://localhost:3000/passport",
    );
  });

  it("defaults to the local forms origin for a form-only service", () => {
    expect(serviceUrl(row({ slug: "some-form", hasForm: true }))).toBe(
      "http://localhost:4200/forms/some-form",
    );
  });
});
