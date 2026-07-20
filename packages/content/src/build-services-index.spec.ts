import { describe, expect, it } from "vitest";
import { buildServicesIndex } from "./build-services-index";

describe("buildServicesIndex", () => {
  it("maps slug and title", () => {
    const out = buildServicesIndex([
      { slug: "get-birth-certificate", title: "Get a birth certificate" },
    ]);
    expect(out).toEqual([
      {
        slug: "get-birth-certificate",
        title: "Get a birth certificate",
        visibility: "public",
      },
    ]);
  });

  it("prefers categories[0] over category, else falls back to category", () => {
    const out = buildServicesIndex([
      {
        slug: "a",
        title: "A",
        categories: ["primary", "second"],
        category: "x",
      },
      { slug: "b", title: "B", category: "only" },
    ]);
    expect(out[0].category).toBe("primary");
    expect(out[1].category).toBe("only");
  });

  it("carries form_id through as formId, omitting it when absent", () => {
    const out = buildServicesIndex([
      { slug: "a", title: "A", form_id: "form-a" },
      { slug: "b", title: "B" },
    ]);
    expect(out[0].formId).toBe("form-a");
    expect(out[1].formId).toBeUndefined();
  });

  it("carries visibility through and defaults to public", () => {
    const out = buildServicesIndex([
      { slug: "a", title: "A", visibility: "draft" },
      { slug: "b", title: "B" },
    ]);
    expect(out[0].visibility).toBe("draft");
    expect(out[1].visibility).toBe("public");
  });

  it("sorts by slug for stable generated output", () => {
    const out = buildServicesIndex([
      { slug: "b", title: "B" },
      { slug: "a", title: "A" },
    ]);
    expect(out.map((e) => e.slug)).toEqual(["a", "b"]);
  });
});
