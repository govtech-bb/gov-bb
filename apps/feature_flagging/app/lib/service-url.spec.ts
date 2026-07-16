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
  it("prepends the category to a top-level (leaf) landing slug", () => {
    expect(
      buildServiceUrl(
        row({
          slug: "get-birth-certificate",
          hasForm: true,
          category: "family-birth-relationships",
          landingUrl: "get-birth-certificate",
        }),
        "https://alpha.gov.bb",
        "https://forms.alpha.gov.bb",
      ),
    ).toBe(
      "https://alpha.gov.bb/family-birth-relationships/get-birth-certificate",
    );
  });

  it("does not double-prefix a landing slug that already carries its category", () => {
    expect(
      buildServiceUrl(
        row({
          slug: "stormready",
          category: "health-and-emergency-services",
          landingUrl: "health-and-emergency-services/stormready",
        }),
        "https://alpha.gov.bb",
        "https://forms.alpha.gov.bb",
      ),
    ).toBe("https://alpha.gov.bb/health-and-emergency-services/stormready");
  });

  it("uses the bare landing slug when there is no category", () => {
    expect(
      buildServiceUrl(
        row({ landingUrl: "some-service" }),
        "https://alpha.gov.bb",
        "https://forms.alpha.gov.bb",
      ),
    ).toBe("https://alpha.gov.bb/some-service");
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
  it("defaults to the local landing origin, category-prefixed", () => {
    expect(
      serviceUrl(row({ category: "travel-transport", landingUrl: "passport" })),
    ).toBe("http://localhost:3000/travel-transport/passport");
  });

  it("defaults to the local forms origin for a form-only service", () => {
    expect(serviceUrl(row({ slug: "some-form", hasForm: true }))).toBe(
      "http://localhost:4200/forms/some-form",
    );
  });
});
