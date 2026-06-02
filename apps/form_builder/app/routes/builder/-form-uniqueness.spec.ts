import { checkFormUniqueness } from "./-form-uniqueness";
import type { FormDefinitionSummary } from "../../types/index";

function form(over: Partial<FormDefinitionSummary>): FormDefinitionSummary {
  return {
    id: "x",
    formId: "x",
    title: "X",
    version: "1.0.0",
    isPublished: false,
    ...over,
  };
}

const forms: FormDefinitionSummary[] = [
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
});
