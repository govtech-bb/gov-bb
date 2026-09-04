import { describe, it, expect } from "vitest";
import {
  interpolateConfirmationMarkdown,
  resolveConditionalMarkdown,
} from "./confirmation-markdown";

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

describe("resolveConditionalMarkdown", () => {
  // Mirrors the temporary restaurant permit recipe (#2068): the inspection
  // wording follows `has-food-licence`, the officer-request paragraph follows
  // `is-organiser`, and the two vary independently over one body.
  const step = {
    markdownContent: "Lead.\n\n{inspection}\n\n{officerRequest}\n\nTail.",
    conditionalMarkdown: [
      {
        token: "inspection",
        default: "They may arrange an inspection.",
        variants: [
          {
            targetStepId: "food-safety",
            targetFieldId: "has-food-licence",
            operator: "equal" as const,
            value: "no",
            content: "An officer will inspect your set-up.",
          },
        ],
      },
      {
        token: "officerRequest",
        default: "",
        variants: [
          {
            targetStepId: "event-organiser",
            targetFieldId: "is-organiser",
            operator: "equal" as const,
            value: "yes",
            content: "An officer has been requested.",
          },
        ],
      },
    ],
  };

  const valuesFor = (hasFoodLicence: string, isOrganiser: string) => ({
    "food-safety": { "has-food-licence": hasFoodLicence },
    "event-organiser": { "is-organiser": isOrganiser },
  });

  it("resolves both segments independently across the answer matrix", () => {
    expect(resolveConditionalMarkdown(step, valuesFor("no", "yes"))).toBe(
      "Lead.\n\nAn officer will inspect your set-up.\n\nAn officer has been requested.\n\nTail.",
    );
    expect(resolveConditionalMarkdown(step, valuesFor("no", "no"))).toBe(
      "Lead.\n\nAn officer will inspect your set-up.\n\n\n\nTail.",
    );
    expect(resolveConditionalMarkdown(step, valuesFor("yes", "yes"))).toBe(
      "Lead.\n\nThey may arrange an inspection.\n\nAn officer has been requested.\n\nTail.",
    );
    expect(resolveConditionalMarkdown(step, valuesFor("yes", "no"))).toBe(
      "Lead.\n\nThey may arrange an inspection.\n\n\n\nTail.",
    );
  });

  it("falls back to every default when no values are supplied", () => {
    // The refresh path: the draft is cleared on submit, so a re-render with no
    // answers must still render sane copy — never a literal `{inspection}`.
    const resolved = resolveConditionalMarkdown(step, {});
    expect(resolved).toContain("They may arrange an inspection.");
    expect(resolved).not.toContain("{inspection}");
    expect(resolved).not.toContain("{officerRequest}");
  });

  it("takes the first matching variant", () => {
    const multi = {
      markdownContent: "{who}",
      conditionalMarkdown: [
        {
          token: "who",
          default: "nobody",
          variants: [
            {
              targetFieldId: "role",
              operator: "equal" as const,
              value: "organiser",
              content: "first",
            },
            {
              targetFieldId: "role",
              operator: "equal" as const,
              value: "organiser",
              content: "second",
            },
          ],
        },
      ],
    };
    expect(
      resolveConditionalMarkdown(multi, { s: { role: "organiser" } }),
    ).toBe("first");
  });

  it("leaves segment-supplied built-in tokens for the interpolator", () => {
    // Segments resolve first, so a segment may itself carry `{polyclinic}`.
    const withToken = {
      markdownContent: "{note}",
      conditionalMarkdown: [
        {
          token: "note",
          default: "",
          variants: [
            {
              targetFieldId: "is-organiser",
              operator: "equal" as const,
              value: "yes",
              content: "Collect it from {polyclinic}.",
            },
          ],
        },
      ],
    };
    const resolved = resolveConditionalMarkdown(withToken, {
      s: { "is-organiser": "yes" },
    });
    expect(resolved).toBe("Collect it from {polyclinic}.");
    expect(
      interpolateConfirmationMarkdown(resolved, {
        polyclinic: "Maurice Byer Polyclinic",
      }),
    ).toBe("Collect it from Maurice Byer Polyclinic.");
  });

  it("returns markdown untouched when the step carries no segments", () => {
    expect(
      resolveConditionalMarkdown({ markdownContent: "Plain body." }, {}),
    ).toBe("Plain body.");
  });

  it("returns undefined when the step carries no markdown", () => {
    expect(resolveConditionalMarkdown({}, {})).toBeUndefined();
  });
});
