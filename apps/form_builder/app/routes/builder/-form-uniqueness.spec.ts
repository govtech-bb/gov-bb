import { checkFormUniqueness, checkRekeyPublished } from "./-form-uniqueness";
import type { BuilderFormSummary } from "../../types/index";

function form(over: Partial<BuilderFormSummary>): BuilderFormSummary {
  return {
    id: "x",
    formId: "x",
    title: "X",
    version: "1.0.0",
    isPublished: false,
    ...over,
  };
}

const forms: BuilderFormSummary[] = [
  form({ formId: "birth-registration", title: "Birth Registration" }),
  form({ formId: "death-certificate", title: "Death Certificate" }),
];

describe("checkFormUniqueness — formId", () => {
  it("flags a new form reusing an existing formId", () => {
    const r = checkFormUniqueness(
      forms,
      { formId: "birth-registration", title: "Something New" },
      null,
    );
    expect(r.idError).toMatch(/ID "birth-registration" already exists/);
  });

  it("does not flag a form keeping its own id (a new version)", () => {
    const r = checkFormUniqueness(
      forms,
      { formId: "birth-registration", title: "Birth Registration" },
      "birth-registration",
    );
    expect(r.idError).toBeNull();
  });

  it("does not flag a brand-new, unused id", () => {
    const r = checkFormUniqueness(
      forms,
      { formId: "marriage-license", title: "Marriage License" },
      null,
    );
    expect(r.idError).toBeNull();
  });

  it("does not flag an empty id", () => {
    const r = checkFormUniqueness(forms, { formId: "", title: "" }, null);
    expect(r.idError).toBeNull();
  });
});

describe("checkFormUniqueness — title", () => {
  it("flags a title that collides case/whitespace-insensitively", () => {
    const r = checkFormUniqueness(
      forms,
      { formId: "new-form", title: "  birth registration " },
      null,
    );
    expect(r.titleError).toMatch(/already exists. Choose a different title/);
  });

  it("allows a form keeping its own title (rename-to-self)", () => {
    const r = checkFormUniqueness(
      forms,
      { formId: "birth-registration", title: "Birth Registration" },
      "birth-registration",
    );
    expect(r.titleError).toBeNull();
  });

  it("flags renaming into another form's title", () => {
    const r = checkFormUniqueness(
      forms,
      { formId: "death-certificate", title: "Birth Registration" },
      "death-certificate",
    );
    expect(r.titleError).toMatch(/already exists/);
  });

  it("does not flag an empty title", () => {
    const r = checkFormUniqueness(
      forms,
      { formId: "new-form", title: "   " },
      null,
    );
    expect(r.titleError).toBeNull();
  });

  it("does not self-collide when re-keying a form while keeping its own title", () => {
    // Re-key: a loaded form changes its id to a fresh, unused one but keeps its
    // title. The title still belongs to the form's own (old-id) record, which is
    // excluded by loadedFromId — so neither check fires (issue #674).
    const r = checkFormUniqueness(
      forms,
      { formId: "birth-reg-new", title: "Birth Registration" },
      "birth-registration",
    );
    expect(r.idError).toBeNull();
    expect(r.titleError).toBeNull();
  });
});

describe("checkRekeyPublished", () => {
  const publishedForms: BuilderFormSummary[] = [
    form({
      formId: "birth-registration",
      title: "Birth Registration",
      isPublished: true,
    }),
    form({
      formId: "death-certificate",
      title: "Death Certificate",
      isPublished: false,
    }),
  ];

  it("blocks re-keying a published form", () => {
    const r = checkRekeyPublished(
      publishedForms,
      { formId: "birth-reg-new" },
      "birth-registration",
    );
    expect(r).toMatch(/published form/i);
  });

  it("allows re-keying a draft-only form", () => {
    const r = checkRekeyPublished(
      publishedForms,
      { formId: "death-cert-new" },
      "death-certificate",
    );
    expect(r).toBeNull();
  });

  it("does not block when the id is unchanged (a new version, not a re-key)", () => {
    const r = checkRekeyPublished(
      publishedForms,
      { formId: "birth-registration" },
      "birth-registration",
    );
    expect(r).toBeNull();
  });

  it("does not block a brand-new form (nothing loaded)", () => {
    const r = checkRekeyPublished(
      publishedForms,
      { formId: "brand-new" },
      null,
    );
    expect(r).toBeNull();
  });

  it("does not block when the new id is empty (id-required handles that)", () => {
    const r = checkRekeyPublished(
      publishedForms,
      { formId: "" },
      "birth-registration",
    );
    expect(r).toBeNull();
  });
});
