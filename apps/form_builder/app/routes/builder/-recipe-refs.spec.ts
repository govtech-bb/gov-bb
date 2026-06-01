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
      fields: [field("f1", "components/text")],
      behaviours: [],
    }),
    catalog,
  );
  expect(refs).toEqual([
    { stepId: "step-1", fieldId: "text", displayName: "Text" },
  ]);
});

it("expands a block ref into one entry per child fieldId with a prefixed label", () => {
  const refs = getFieldRefs(
    draftOf({
      stepId: "step-1",
      title: "Step 1",
      fields: [field("f1", "blocks/name")],
      behaviours: [],
    }),
    catalog,
  );
  expect(refs).toEqual([
    {
      stepId: "step-1",
      fieldId: "first-name",
      displayName: "Name › First Name",
    },
    { stepId: "step-1", fieldId: "last-name", displayName: "Name › Last Name" },
  ]);
});

it("respects a component-level fieldId override", () => {
  const refs = getFieldRefs(
    draftOf({
      stepId: "step-1",
      title: "Step 1",
      fields: [
        field("f1", "components/text", { overrides: { fieldId: "nickname" } }),
      ],
      behaviours: [],
    }),
    catalog,
  );
  expect(refs).toEqual([
    { stepId: "step-1", fieldId: "nickname", displayName: "Text" },
  ]);
});

it("respects a block child fieldId override", () => {
  const refs = getFieldRefs(
    draftOf({
      stepId: "step-1",
      title: "Step 1",
      fields: [
        field("f1", "blocks/name", {
          childOverrides: { "first-name": { fieldId: "given-name" } },
        }),
      ],
      behaviours: [],
    }),
    catalog,
  );
  expect(refs.map((r) => r.fieldId)).toEqual(["given-name", "last-name"]);
});

it("tags each entry with the step it belongs to", () => {
  const refs = getFieldRefs(
    draftOf(
      {
        stepId: "step-1",
        title: "Step 1",
        fields: [field("f1", "components/text")],
        behaviours: [],
      },
      {
        stepId: "step-2",
        title: "Step 2",
        fields: [field("f2", "components/email")],
        behaviours: [],
      },
    ),
    catalog,
  );
  expect(refs).toEqual([
    { stepId: "step-1", fieldId: "text", displayName: "Text" },
    { stepId: "step-2", fieldId: "email", displayName: "Email" },
  ]);
});
