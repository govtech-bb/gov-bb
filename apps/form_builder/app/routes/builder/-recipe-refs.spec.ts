import { getCatalog } from "@govtech-bb/form-builder";
import type { RecipeDraft, RecipeFieldDraft } from "@govtech-bb/form-builder";
import { getFieldRefs } from "./-recipe-refs";

const catalog = getCatalog();

function draftOf(...steps: RecipeDraft["steps"]): RecipeDraft {
  return { formId: "form-001", title: "Test Form", steps };
}

function field(
  id: string,
  ref: string,
  extra: Partial<RecipeFieldDraft> = {},
): RecipeFieldDraft {
  return {
    id,
    kind: ref.startsWith("blocks/") ? "block" : "component",
    ref,
    overrides: {},
    ...extra,
  };
}

it("resolves a component ref to its primitive fieldId (not the registry ref)", () => {
  const refs = getFieldRefs(
    draftOf({
      stepId: "step-1",
      title: "Step 1",
      fields: [field("f1", "components/generic-text")],
      behaviours: [],
    }),
    catalog,
  );
  expect(refs).toEqual([
    {
      stepId: "step-1",
      fieldId: "generic-text",
      displayName: "Text",
      isBoolean: false,
    },
  ]);
});

it("expands a block ref into one entry per child fieldId with a prefixed label", () => {
  const refs = getFieldRefs(
    draftOf({
      stepId: "step-1",
      title: "Step 1",
      fields: [field("f1", "blocks/personal-information")],
      behaviours: [],
    }),
    catalog,
  );
  // One entry per child, label prefixed with the block id, never boolean.
  expect(refs.every((r) => r.stepId === "step-1" && !r.isBoolean)).toBe(true);
  expect(
    refs.map((r) => ({ fieldId: r.fieldId, displayName: r.displayName })),
  ).toEqual([
    { fieldId: "title", displayName: "personal-information › Title" },
    { fieldId: "first-name", displayName: "personal-information › First name" },
    {
      fieldId: "middle-name",
      displayName: "personal-information › Middle name",
    },
    { fieldId: "last-name", displayName: "personal-information › Last name" },
    {
      fieldId: "date-of-birth",
      displayName: "personal-information › Date of birth",
    },
    { fieldId: "sex", displayName: "personal-information › Sex" },
    {
      fieldId: "nationality",
      displayName: "personal-information › Nationality / Citizenship",
    },
    {
      fieldId: "national-id-number",
      displayName: "personal-information › National ID number",
    },
  ]);
});

it("respects a component-level fieldId override", () => {
  const refs = getFieldRefs(
    draftOf({
      stepId: "step-1",
      title: "Step 1",
      fields: [
        field("f1", "components/generic-text", {
          overrides: { fieldId: "nickname" },
        }),
      ],
      behaviours: [],
    }),
    catalog,
  );
  expect(refs).toEqual([
    {
      stepId: "step-1",
      fieldId: "nickname",
      displayName: "Text",
      isBoolean: false,
    },
  ]);
});

it("respects a block child fieldId override", () => {
  const refs = getFieldRefs(
    draftOf({
      stepId: "step-1",
      title: "Step 1",
      fields: [
        field("f1", "blocks/personal-information", {
          childOverrides: { "first-name": { fieldId: "given-name" } },
        }),
      ],
      behaviours: [],
    }),
    catalog,
  );
  // first-name's id is overridden; the block's other children keep theirs.
  expect(refs.map((r) => r.fieldId)).toEqual([
    "title",
    "given-name",
    "middle-name",
    "last-name",
    "date-of-birth",
    "sex",
    "nationality",
    "national-id-number",
  ]);
});

it("tags each entry with the step it belongs to", () => {
  const refs = getFieldRefs(
    draftOf(
      {
        stepId: "step-1",
        title: "Step 1",
        fields: [field("f1", "components/generic-text")],
        behaviours: [],
      },
      {
        stepId: "step-2",
        title: "Step 2",
        fields: [field("f2", "components/generic-email")],
        behaviours: [],
      },
    ),
    catalog,
  );
  expect(refs).toEqual([
    {
      stepId: "step-1",
      fieldId: "generic-text",
      displayName: "Text",
      isBoolean: false,
    },
    {
      stepId: "step-2",
      fieldId: "generic-email",
      displayName: "Email",
      isBoolean: false,
    },
  ]);
});

it("flags a show-hide toggle isBoolean, but not a checkbox (stores a string)", () => {
  const refs = getFieldRefs(
    draftOf({
      stepId: "step-1",
      title: "Step 1",
      fields: [
        field("f1", "components/show-hide"),
        field("f2", "components/generic-checkbox"),
        field("f3", "components/generic-text"),
      ],
      behaviours: [],
    }),
    catalog,
  );
  expect(refs).toEqual([
    {
      stepId: "step-1",
      fieldId: "show-hide",
      displayName: "Show / hide",
      isBoolean: true,
    },
    {
      stepId: "step-1",
      fieldId: "generic-checkbox",
      displayName: "Checkbox",
      isBoolean: false,
    },
    {
      stepId: "step-1",
      fieldId: "generic-text",
      displayName: "Text",
      isBoolean: false,
    },
  ]);
});
