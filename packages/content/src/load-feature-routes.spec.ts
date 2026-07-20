import { describe, expect, it } from "vitest";
import { mapFeatureMetasToServices } from "./load-feature-routes";

describe("mapFeatureMetasToServices", () => {
  it("maps a FeatureMeta to a services-index source keyed by url", () => {
    const { services, warnings } = mapFeatureMetasToServices([
      {
        url: "bank-holiday-calendar",
        title: "Check bank holiday dates",
        category: "work-employment",
        visibility: "public",
      },
    ]);
    expect(warnings).toEqual([]);
    expect(services).toEqual([
      {
        slug: "bank-holiday-calendar",
        title: "Check bank holiday dates",
        category: "work-employment",
        visibility: "public",
      },
    ]);
  });

  it("never emits a form_id — code-route pages have no form", () => {
    const [svc] = mapFeatureMetasToServices([
      { url: "a", title: "A" },
    ]).services;
    expect(svc).not.toHaveProperty("formId");
    expect(svc).not.toHaveProperty("form_id");
  });

  it("omits category and visibility when absent so buildServicesIndex defaults apply", () => {
    const [svc] = mapFeatureMetasToServices([
      { url: "a", title: "A" },
    ]).services;
    expect(svc).toEqual({ slug: "a", title: "A" });
  });

  it("ignores an invalid visibility rather than passing it through", () => {
    const [svc] = mapFeatureMetasToServices([
      { url: "a", title: "A", visibility: "internal" },
    ]).services;
    expect(svc).not.toHaveProperty("visibility");
  });

  it("drops a meta missing url or title, with a warning, without throwing", () => {
    const { services, warnings } = mapFeatureMetasToServices([
      { title: "no url" },
      { url: "no-title" },
      null,
      { url: "ok", title: "OK" },
    ]);
    expect(services).toEqual([{ slug: "ok", title: "OK" }]);
    expect(warnings).toHaveLength(3);
  });
});
