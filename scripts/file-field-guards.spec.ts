import { checkFileFieldsDeclareTypes } from "./file-field-guards";

function recipe(overrides: unknown, ref = "components/upload-document") {
  return {
    steps: [{ stepId: "supporting-documents", elements: [{ ref, overrides }] }],
  };
}

const VALID = {
  fieldId: "police-certificate",
  validations: {
    fileTypes: {
      value: ["application/pdf", "image/jpeg", "image/png"],
      error: "Upload a PDF, JPG or PNG",
    },
  },
};

describe("checkFileFieldsDeclareTypes", () => {
  it("accepts a file field that declares fileTypes", () => {
    expect(checkFileFieldsDeclareTypes(recipe(VALID), "r.json")).toEqual([]);
  });

  it("accepts dotted and bare extension entries", () => {
    const el = {
      fieldId: "staff-list",
      validations: { fileTypes: { value: [".xlsx", "pdf"] } },
    };
    expect(checkFileFieldsDeclareTypes(recipe(el), "r.json")).toEqual([]);
  });

  it("rejects a file field with no fileTypes, naming step and field", () => {
    const errors = checkFileFieldsDeclareTypes(
      recipe({ fieldId: "police-certificate" }),
      "r.json",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("supporting-documents.police-certificate");
    expect(errors[0]).toContain("declares no fileTypes");
  });

  // generic-file is the other file primitive and inherits `required: true`, so a
  // missing allowlist there is the case that can strand an applicant.
  it("rejects a generic-file field with no fileTypes", () => {
    const errors = checkFileFieldsDeclareTypes(
      recipe({ fieldId: "birth-certificate" }, "components/generic-file"),
      "r.json",
    );
    expect(errors).toHaveLength(1);
  });

  it.each([
    ["an empty array", []],
    ["a comma-separated string", "application/pdf,image/png"],
    ["a blank entry", ["application/pdf", "  "]],
    ["a non-string entry", ["application/pdf", 5]],
  ])("rejects fileTypes.value that is %s", (_label, value) => {
    const errors = checkFileFieldsDeclareTypes(
      recipe({ fieldId: "doc", validations: { fileTypes: { value } } }),
      "r.json",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("invalid fileTypes.value");
  });

  it("ignores non-file elements and malformed recipes", () => {
    expect(
      checkFileFieldsDeclareTypes(
        recipe({ fieldId: "first-name" }, "components/generic-text"),
        "r.json",
      ),
    ).toEqual([]);
    expect(checkFileFieldsDeclareTypes({}, "r.json")).toEqual([]);
    expect(
      checkFileFieldsDeclareTypes({ steps: [{ stepId: "s" }] }, "r.json"),
    ).toEqual([]);
  });

  it("falls back to the element index when fieldId is absent", () => {
    const errors = checkFileFieldsDeclareTypes(recipe({}), "r.json");
    expect(errors[0]).toContain("supporting-documents.element 0");
  });
});
