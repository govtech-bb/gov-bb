import { describe, it, expect } from "vitest";
import {
  findRecipeIdCollisions,
  getCatalog,
  hydrateForm,
  serializeRecipeDraft,
  type RecipeDraft,
  type RegistryCatalog,
} from "@govtech-bb/form-builder";
import { duplicateFieldDraft, duplicateStepDraft } from "./duplicate";
import { recipeReducer } from "./recipe-reducer";

it("duplicates a page with independent IDs and rules, preserving external references and delivery", () => {
  const catalog: RegistryCatalog = {
    ...getCatalog(),
    blocks: [
      {
        ref: "blocks/address-test",
        displayName: "Address",
        block: {
          blockId: "address-test",
          blockDescription: "Address",
          blockVersion: "1",
          elements: [
            {
              fieldId: "street",
              label: "Street",
              htmlType: "address-lookup",
              geocodeTargets: { parishFieldId: "parish" },
            },
            {
              fieldId: "parish",
              label: "Parish",
              htmlType: "text",
              behaviours: [
                {
                  type: "fieldConditionalOn",
                  targetFieldId: "street",
                  operator: "exists",
                  value: true,
                },
              ],
            },
          ],
        },
      },
    ],
    custom: [
      {
        ref: "components/custom-limit",
        displayName: "Limit",
        namespace: "custom",
        type: "limit",
        definition: {
          fieldId: "limit",
          label: "Limit",
          htmlType: "number",
          validations: {
            gt: {
              referenceFieldId: "quantity",
              targetStepId: "details",
              error: "Too small",
            },
          },
          conditionalLabel: [
            {
              targetFieldId: "quantity",
              targetStepId: "details",
              operator: "equal",
              value: "quantity",
              label: "quantity",
            },
          ],
        },
      },
    ],
  };
  const draft: RecipeDraft = {
    formId: "example",
    title: "Example",
    mdaContactId: "contact",
    meta: { visibility: "draft" },
    processors: [
      {
        id: "email",
        type: "email",
        config: {
          recipientField: "details.quantity",
          label: "Department",
          subject: "Submission",
        },
      },
    ],
    steps: [
      { stepId: "earlier", title: "Eligibility", fields: [], behaviours: [] },
      {
        stepId: "details",
        title: "Details",
        description: "Describe this",
        markdownContent: "quantity {passage}",
        behaviours: [
          {
            type: "stepConditionalOn",
            targetStepId: "earlier",
            targetFieldId: "eligible",
            operator: "equal",
            value: "yes",
          },
          { type: "sharedFields", fieldIds: ["quantity"] },
        ],
        conditionalMarkdown: [
          {
            token: "passage",
            default: "quantity",
            variants: [
              {
                targetStepId: "details",
                targetFieldId: "quantity",
                operator: "equal",
                value: "quantity",
                content: "quantity",
              },
            ],
          },
        ],
        fields: [
          {
            id: "question",
            kind: "component",
            ref: "components/generic-text",
            overrides: {
              fieldId: "quantity",
              label: "Quantity",
              defaultValue: { targetFieldId: "quantity" },
              options: [{ label: "quantity", value: "quantity" }],
              behaviours: [
                {
                  type: "optionalIf",
                  targetFieldId: "quantity",
                  targetStepId: "earlier",
                  operator: "equal",
                  value: "quantity",
                },
              ],
            },
          },
          {
            id: "limit",
            kind: "custom",
            ref: "components/custom-limit",
            overrides: {},
          },
          {
            id: "address",
            kind: "block",
            ref: "blocks/address-test",
            overrides: {},
            childOverrides: { street: { hint: "Your street" } },
          },
        ],
      },
      {
        stepId: "check-your-answers",
        title: "Check your answers",
        fields: [],
        behaviours: [],
      },
    ],
  };
  const original = structuredClone(draft);
  const copy = duplicateStepDraft(draft, draft.steps[1], catalog);
  const next = recipeReducer(draft, {
    type: "DUPLICATE_STEP",
    stepId: "details",
    copy,
  });
  expect(next.steps.map((step) => step.stepId)).toEqual([
    "earlier",
    "details",
    "details-copy",
    "check-your-answers",
  ]);
  expect(copy.title).toBe("Details (copy)");
  expect(copy.description).toBe("Describe this");
  expect(copy.markdownContent).toBe("quantity {passage}");
  expect(copy.behaviours).toEqual([
    original.steps[1].behaviours[0],
    { type: "sharedFields", fieldIds: ["quantity-copy"] },
  ]);
  expect(copy.conditionalMarkdown?.[0].variants[0]).toEqual({
    targetStepId: "details-copy",
    targetFieldId: "quantity-copy",
    operator: "equal",
    value: "quantity",
    content: "quantity",
  });
  expect(
    copy.fields.every(
      (field) =>
        !draft.steps[1].fields.some((source) => source.id === field.id),
    ),
  ).toBe(true);
  const served = hydrateForm(serializeRecipeDraft(next), catalog).steps[2]
    .elements;
  expect(served.map((field) => field.fieldId)).toEqual([
    "quantity-copy",
    "limit-copy",
    "street-copy",
    "parish-copy",
  ]);
  expect(served[0].behaviours).toEqual(
    draft.steps[1].fields[0].overrides.behaviours,
  );
  expect(served[0].defaultValue).toEqual({ targetFieldId: "quantity" });
  expect(served[0].options).toEqual([{ label: "quantity", value: "quantity" }]);
  expect(served[1].validations?.gt).toEqual({
    referenceFieldId: "quantity-copy",
    targetStepId: "details-copy",
    error: "Too small",
  });
  expect(served[1].conditionalLabel?.[0]).toEqual({
    targetFieldId: "quantity-copy",
    targetStepId: "details-copy",
    operator: "equal",
    value: "quantity",
    label: "quantity",
  });
  expect(served[2].geocodeTargets).toEqual({ parishFieldId: "parish-copy" });
  expect(served[3].behaviours?.[0]).toMatchObject({
    targetFieldId: "street-copy",
  });
  expect(next.processors).toBe(draft.processors);
  expect(next.mdaContactId).toBe("contact");
  expect(next.meta).toBe(draft.meta);
  const second = duplicateStepDraft(next, copy, catalog);
  expect(second.title).toBe("Details (copy 2)");
  expect(second.stepId).toBe("details-copy-2");
  const twice = recipeReducer(next, {
    type: "DUPLICATE_STEP",
    stepId: copy.stepId,
    copy: second,
  });
  expect(findRecipeIdCollisions(twice, catalog)).toEqual({
    fieldIdCollisions: [],
    stepIdCollisions: [],
  });
  copy.fields[0].overrides.options![0].label = "Changed";
  copy.fields[2].childOverrides!.street.hint = "Changed";
  expect(draft).toEqual(original);
});

describe("question copies and protected pages", () => {
  it("inserts each question beside its source, keeping rules to other questions", () => {
    const catalog = getCatalog();
    const draft: RecipeDraft = {
      formId: "f",
      title: "F",
      steps: [
        {
          stepId: "details",
          title: "Details",
          behaviours: [],
          fields: [
            {
              id: "first",
              kind: "component",
              ref: "components/generic-text",
              overrides: {
                fieldId: "first",
                label: "First",
                behaviours: [
                  {
                    type: "fieldConditionalOn",
                    targetFieldId: "other",
                    operator: "equal",
                    value: "yes",
                  },
                ],
              },
            },
            {
              id: "last",
              kind: "component",
              ref: "components/generic-text",
              overrides: { fieldId: "other", label: "Other" },
            },
          ],
        },
      ],
    };
    const source = draft.steps[0].fields[0];
    const copy = duplicateFieldDraft(draft, draft.steps[0], source, catalog);
    const action = {
      type: "DUPLICATE_FIELD" as const,
      stepId: "details",
      fieldId: "first",
      copy,
    };
    const next = recipeReducer(draft, action);
    expect(next.steps[0].fields.map((field) => field.overrides.label)).toEqual([
      "First",
      "First (copy)",
      "Other",
    ]);
    expect(copy.overrides.behaviours).toEqual(source.overrides.behaviours);
    expect(copy.overrides.fieldId).toBe("first-copy");
    const again = duplicateFieldDraft(next, next.steps[0], copy, catalog);
    expect(again.overrides.label).toBe("First (copy 2)");
    expect(again.overrides.fieldId).toBe("first-copy-2");
    expect(recipeReducer(next, action)).toBe(next);
    expect(recipeReducer(draft, { ...action, fieldId: "missing" })).toBe(draft);
    // Missing registry entries cannot be copied into an unresolvable draft.
    expect(() =>
      duplicateFieldDraft(
        draft,
        draft.steps[0],
        { ...source, ref: "components/missing" },
        catalog,
      ),
    ).toThrow("Question type unavailable");
  });

  it("keeps the managed review, declaration and confirmation pages single", () => {
    for (const stepId of [
      "check-your-answers",
      "declaration",
      "submission-confirmation",
    ]) {
      const step = { stepId, title: stepId, fields: [], behaviours: [] };
      const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
      expect(
        recipeReducer(draft, {
          type: "DUPLICATE_STEP",
          stepId,
          copy: { ...step, stepId: `${stepId}-copy` },
        }),
      ).toBe(draft);
    }
  });
});
