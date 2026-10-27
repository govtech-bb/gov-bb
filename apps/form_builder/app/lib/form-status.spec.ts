import { FORM_STATUS_LABEL, formStatus, loadedFormStatus } from "./form-status";
import type { BuilderFormSummary } from "../types";

const published: BuilderFormSummary = {
  id: "alpha",
  formId: "alpha",
  title: "Alpha",
  version: "1.0.0",
  isPublished: true,
};

describe("formStatus (#2875)", () => {
  it("returns the effective visibility apps/api stamped on a published form", () => {
    expect(formStatus({ ...published, visibility: "public" })).toBe("public");
    expect(formStatus({ ...published, visibility: "maintenance" })).toBe(
      "maintenance",
    );
    expect(formStatus({ ...published, visibility: "draft" })).toBe("draft");
  });

  it("is unavailable, never public, for a published form the index returned without a status", () => {
    // The proxy fell back to apps/api's public-only list (no preview token),
    // which carries no `visibility`. The old #1835 reading treated that as
    // `public`; the builder must say it does not know instead.
    expect(formStatus(published)).toBe("unavailable");
  });

  it("is null for an unpublished or unknown form — there is no live status yet", () => {
    expect(formStatus({ ...published, isPublished: false })).toBeNull();
    expect(
      formStatus({ ...published, isPublished: false, visibility: "public" }),
    ).toBeNull();
    expect(formStatus(undefined)).toBeNull();
  });
});

describe("loadedFormStatus (#2875)", () => {
  it("is loading while the forms list is still in flight", () => {
    expect(loadedFormStatus("alpha", { forms: null, loadError: null })).toBe(
      "loading",
    );
  });

  it("is unavailable when the forms list could not be loaded", () => {
    expect(loadedFormStatus("alpha", { forms: null, loadError: "boom" })).toBe(
      "unavailable",
    );
  });

  it("resolves the open form by formId from the list", () => {
    const forms = [
      { ...published, visibility: "preview" as const },
      { ...published, id: "b", formId: "beta", visibility: "public" as const },
    ];
    expect(loadedFormStatus("beta", { forms, loadError: null })).toBe("public");
    expect(loadedFormStatus("alpha", { forms, loadError: null })).toBe(
      "preview",
    );
    expect(loadedFormStatus("new-form", { forms, loadError: null })).toBeNull();
  });
});

it("labels every status, with public spelt as the API's own word", () => {
  expect(FORM_STATUS_LABEL).toEqual({
    public: "Public",
    preview: "Preview",
    draft: "Draft",
    maintenance: "Maintenance",
    unavailable: "Status unavailable",
  });
});
