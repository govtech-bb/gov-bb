import { reconcileCatalogue } from "./catalogue";

describe("reconcileCatalogue", () => {
  it("keys a form-backed landing service by its formId (canonical slug)", () => {
    const rows = reconcileCatalogue({
      landing: [
        {
          contentSlug: "family-birth-relationships/get-birth-certificate",
          title: "Get a birth certificate",
          category: "family-birth-relationships",
          formId: "get-birth-certificate",
          contentVisibility: "public",
        },
      ],
      forms: [{ formId: "get-birth-certificate", title: "Birth certificate" }],
      statuses: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "get-birth-certificate",
      hasForm: true,
      landingUrl: "family-birth-relationships/get-birth-certificate",
      contentVisibility: "public",
      status: "enabled", // no status row → default
    });
  });

  it("keys an info-only landing service by its content slug", () => {
    const rows = reconcileCatalogue({
      landing: [
        {
          contentSlug: "get-disaster-relief-assistance",
          title: "Get disaster relief assistance",
        },
      ],
      forms: [],
      statuses: [],
    });

    expect(rows[0]).toMatchObject({
      slug: "get-disaster-relief-assistance",
      hasForm: false,
    });
  });

  it("includes a form that has no landing page, keyed by formId", () => {
    const rows = reconcileCatalogue({
      landing: [],
      forms: [{ formId: "internal-only-form", title: "Internal form" }],
      statuses: [],
    });

    expect(rows[0]).toMatchObject({
      slug: "internal-only-form",
      title: "Internal form",
      hasForm: true,
    });
  });

  it("does not double-count a service present in both landing and forms", () => {
    const rows = reconcileCatalogue({
      landing: [
        {
          contentSlug: "work/apply-for-conductor-licence",
          title: "Apply for a conductor licence",
          formId: "apply-for-conductor-licence",
        },
      ],
      forms: [
        { formId: "apply-for-conductor-licence", title: "Conductor licence" },
      ],
      statuses: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("apply-for-conductor-licence");
    // Landing title wins over the form title for a merged row.
    expect(rows[0].title).toBe("Apply for a conductor licence");
  });

  it("overlays the live status onto the matching canonical slug", () => {
    const rows = reconcileCatalogue({
      landing: [
        {
          contentSlug: "passport-renewal",
          title: "Passport",
          formId: "passport-renewal",
        },
      ],
      forms: [{ formId: "passport-renewal", title: "Passport" }],
      statuses: [{ slug: "passport-renewal", status: "form_disabled" }],
    });

    expect(rows[0].status).toBe("form_disabled");
  });

  it("surfaces an orphan status row that matches no catalogue entry", () => {
    const rows = reconcileCatalogue({
      landing: [],
      forms: [],
      statuses: [{ slug: "ghost-service", status: "disabled" }],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "ghost-service",
      status: "disabled",
      hasForm: false,
      orphan: true,
    });
  });

  it("sorts rows by title, case-insensitively", () => {
    const rows = reconcileCatalogue({
      landing: [
        { contentSlug: "b", title: "Banana" },
        { contentSlug: "a", title: "apple" },
      ],
      forms: [],
      statuses: [],
    });

    expect(rows.map((r) => r.title)).toEqual(["apple", "Banana"]);
  });
});
