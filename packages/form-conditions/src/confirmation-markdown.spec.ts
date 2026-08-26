import { describe, it, expect } from "vitest";
import { interpolateConfirmationMarkdown } from "./confirmation-markdown";

describe("interpolateConfirmationMarkdown", () => {
  it("substitutes a resolved token value", () => {
    expect(
      interpolateConfirmationMarkdown("Visit {polyclinic} on Monday.", {
        polyclinic: "Warrens Polyclinic",
      }),
    ).toBe("Visit Warrens Polyclinic on Monday.");
  });

  it("replaces every occurrence of a token (replaceAll parity)", () => {
    expect(
      interpolateConfirmationMarkdown("{polyclinic} — see {polyclinic}.", {
        polyclinic: "Warrens Polyclinic",
      }),
    ).toBe("Warrens Polyclinic — see Warrens Polyclinic.");
  });

  it("falls back to the shared phrase when the value is undefined", () => {
    expect(
      interpolateConfirmationMarkdown("Visit {polyclinic}.", {
        polyclinic: undefined,
      }),
    ).toBe("Visit your local polyclinic.");
  });

  it("falls back to the shared phrase when the value is null", () => {
    expect(
      interpolateConfirmationMarkdown("Visit {polyclinic}.", {
        polyclinic: null,
      }),
    ).toBe("Visit your local polyclinic.");
  });

  it("leaves content unchanged when the token is absent", () => {
    expect(
      interpolateConfirmationMarkdown("No token in this copy.", {
        polyclinic: "Warrens Polyclinic",
      }),
    ).toBe("No token in this copy.");
  });

  it("returns undefined when there is no markdown content (passthrough parity)", () => {
    expect(
      interpolateConfirmationMarkdown(undefined, {
        polyclinic: "Warrens Polyclinic",
      }),
    ).toBeUndefined();
  });

  it("substitutes the landing origin so recipe links resolve per environment", () => {
    expect(
      interpolateConfirmationMarkdown(
        "[Guidance]({landingUrl}/a-page#anchor)",
        {
          landingUrl: "https://landing.sandbox.alpha.gov.bb",
        },
      ),
    ).toBe("[Guidance](https://landing.sandbox.alpha.gov.bb/a-page#anchor)");
  });

  it("strips a trailing slash from the landing origin so paths don't double up", () => {
    expect(
      interpolateConfirmationMarkdown("{landingUrl}/services", {
        landingUrl: "https://staging.alpha.gov.bb//",
      }),
    ).toBe("https://staging.alpha.gov.bb/services");
  });

  it("falls back to the prod origin when the landing URL is unset", () => {
    expect(
      interpolateConfirmationMarkdown("{landingUrl}/services", {
        landingUrl: undefined,
      }),
    ).toBe("https://alpha.gov.bb/services");
  });

  it("falls back to the prod origin rather than emitting a root-relative link", () => {
    // An unset LANDING_BASE_URL arrives as "" (urlOrEmpty). Substituting it
    // would produce "/services" — broken on the forms host and dead in email,
    // which is exactly what this token exists to prevent.
    expect(
      interpolateConfirmationMarkdown("{landingUrl}/services", {
        landingUrl: "",
      }),
    ).toBe("https://alpha.gov.bb/services");
  });

  it("resolves both tokens in one pass", () => {
    expect(
      interpolateConfirmationMarkdown(
        "Sent to {polyclinic}. See [mass events]({landingUrl}/guide).",
        {
          polyclinic: "Warrens Polyclinic",
          landingUrl: "https://alpha.gov.bb",
        },
      ),
    ).toBe(
      "Sent to Warrens Polyclinic. See [mass events](https://alpha.gov.bb/guide).",
    );
  });

  it("preserves an empty-string value (nullish-coalescing parity)", () => {
    // `value ?? fallback` treats "" as present, so the token resolves to "" —
    // matching the pre-extraction `polyclinic ?? "…"` both surfaces used.
    expect(
      interpolateConfirmationMarkdown("[{polyclinic}]", { polyclinic: "" }),
    ).toBe("[]");
  });
});
