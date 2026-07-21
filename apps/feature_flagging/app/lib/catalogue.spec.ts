import {
  reconcileCatalogue,
  serviceTypeLabel,
  sortServiceRows,
  type ServiceRow,
} from "./catalogue";

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
      status: "disabled", // no status row → fail-closed default (#2003)
    });
  });

  it("defaults an unseeded service to `disabled` (fail-closed, matching the api)", () => {
    const rows = reconcileCatalogue({
      landing: [
        { contentSlug: "brand-new-service", title: "Brand new service" },
      ],
      forms: [{ formId: "brand-new-form", title: "Brand new form" }],
      statuses: [],
    });

    expect(rows.map((r) => r.status)).toEqual(["disabled", "disabled"]);
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

describe("serviceTypeLabel", () => {
  const row = (over: Partial<ServiceRow>): ServiceRow => ({
    slug: over.slug ?? "x",
    title: over.title ?? "X",
    hasForm: over.hasForm ?? false,
    status: over.status ?? "enabled",
    ...over,
  });

  it("labels a landing page with a form 'Content + Form'", () => {
    expect(
      serviceTypeLabel(row({ hasForm: true, landingUrl: "cat/svc" })),
    ).toBe("Content + Form");
  });

  it("labels a landing page without a form 'Content'", () => {
    expect(
      serviceTypeLabel(row({ hasForm: false, landingUrl: "cat/svc" })),
    ).toBe("Content");
  });

  it("labels a form with no landing page 'Form only'", () => {
    expect(serviceTypeLabel(row({ hasForm: true }))).toBe("Form only");
  });

  it("returns null for an orphan (no page, no form)", () => {
    expect(serviceTypeLabel(row({ hasForm: false, orphan: true }))).toBeNull();
  });
});

describe("sortServiceRows", () => {
  const row = (over: Partial<ServiceRow>): ServiceRow => ({
    slug: over.slug ?? over.title ?? "x",
    title: over.title ?? "X",
    hasForm: over.hasForm ?? false,
    status: over.status ?? "enabled",
    ...over,
  });

  const rows: ServiceRow[] = [
    row({ title: "Banana", status: "disabled", hasForm: true, category: "b" }),
    row({ title: "apple", status: "enabled", hasForm: false, category: "a" }),
    row({ title: "Cherry", status: "enabled", hasForm: true, category: "c" }),
    row({ title: "date", status: "form_disabled", hasForm: true }),
  ];

  it("default (status asc) floats enabled to the top, alphabetical within group", () => {
    const out = sortServiceRows(rows, "status", "asc");
    expect(out.map((r) => [r.title, r.status])).toEqual([
      ["apple", "enabled"],
      ["Cherry", "enabled"],
      ["date", "form_disabled"],
      ["Banana", "disabled"],
    ]);
  });

  it("status desc reverses the groups but keeps names alphabetical within", () => {
    const out = sortServiceRows(rows, "status", "desc");
    expect(out.map((r) => r.status)).toEqual([
      "disabled",
      "form_disabled",
      "enabled",
      "enabled",
    ]);
    // enabled group still alphabetical (tiebreak isn't reversed)
    expect(out.slice(2).map((r) => r.title)).toEqual(["apple", "Cherry"]);
  });

  it("service sorts by title, case-insensitively, both directions", () => {
    expect(sortServiceRows(rows, "service", "asc").map((r) => r.title)).toEqual(
      ["apple", "Banana", "Cherry", "date"],
    );
    expect(
      sortServiceRows(rows, "service", "desc").map((r) => r.title),
    ).toEqual(["date", "Cherry", "Banana", "apple"]);
  });

  it("category sorts alphabetically with missing categories last", () => {
    const out = sortServiceRows(rows, "category", "asc");
    expect(out.map((r) => r.category ?? "—")).toEqual(["a", "b", "c", "—"]);
  });

  it("type asc puts Form before Info", () => {
    const out = sortServiceRows(rows, "type", "asc");
    expect(out[out.length - 1].hasForm).toBe(false); // the one Info row is last
  });
});
