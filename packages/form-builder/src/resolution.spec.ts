import { hydrateForm } from "./resolution";
import { UnknownRefError } from "./errors";
import { getCatalog, getRegistryItem } from "./catalog";
import type { RegistryCatalog } from "./catalog";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeRecipe(
  overrides: Partial<ServiceContractRecipe> = {},
): ServiceContractRecipe {
  return {
    formId: "form-001",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [],
    ...overrides,
  };
}

// ─── hydrateForm ──────────────────────────────────────────────────────────────

describe("hydrateForm", () => {
  let catalog: RegistryCatalog;

  beforeEach(() => {
    catalog = getCatalog();
  });

  it("preserves formId, title, and version", () => {
    const recipe = makeRecipe();
    const contract = hydrateForm(recipe, catalog);

    expect(contract.formId).toBe("form-001");
    expect(contract.title).toBe("Test Form");
    expect(contract.version).toBe("1.0.0");
  });

  it("omits description when not present in recipe", () => {
    const recipe = makeRecipe();
    const contract = hydrateForm(recipe, catalog);

    expect(contract.description).toBeUndefined();
  });

  it("forwards description when present in recipe", () => {
    const recipe = makeRecipe({ description: "A government form" });
    const contract = hydrateForm(recipe, catalog);

    expect(contract.description).toBe("A government form");
  });

  it("produces empty steps when recipe has no steps", () => {
    const recipe = makeRecipe({ steps: [] });
    const contract = hydrateForm(recipe, catalog);

    expect(contract.steps).toEqual([]);
  });

  it("expands a component ref to its primitive", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/text" }],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].elements).toHaveLength(1);
    const field = contract.steps[0].elements[0];
    expect(field.fieldId).toBe("text");
    expect(field.htmlType).toBe("text");
    expect(field.label).toBe("Text");
  });

  it("applies overrides on a component field (label override)", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            { ref: "components/text", overrides: { label: "Full Name" } },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].elements[0].label).toBe("Full Name");
    expect(contract.steps[0].elements[0].fieldId).toBe("text");
  });

  it("applies overrides on a component field (hint override)", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            { ref: "components/email", overrides: { hint: "Use work email" } },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].elements[0].hint).toBe("Use work email");
  });

  it("applies isDisabled override on a component field", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            { ref: "components/text", overrides: { isDisabled: true } },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].elements[0].isDisabled).toBe(true);
  });

  it("deep-merges validations.required override on a component field", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            {
              ref: "components/text",
              overrides: { validations: { required: { error: "Required" } } },
            },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].elements[0].validations?.required).toEqual({
      error: "Required",
    });
  });

  // Regression (#487): a field that is required in the registry must be made
  // optional by a `required: { value: false }` override — otherwise the merge
  // falls back to the base `{ value: true }` and the field is always required.
  it("un-requires a base-required component via a required:{value:false} override", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            {
              ref: "components/last-name",
              overrides: { validations: { required: { value: false } } },
            },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    const base = getRegistryItem("components/last-name", catalog);
    // Sanity: the base really is required, so the override is doing the work.
    expect(
      base && "primitive" in base
        ? base.primitive.validations?.required?.value
        : undefined,
    ).toBe(true);
    expect(contract.steps[0].elements[0].validations?.required?.value).toBe(
      false,
    );
  });

  it("expands a block ref to all child primitives", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "blocks/name" }],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].elements).toHaveLength(2);
    expect(contract.steps[0].elements[0].fieldId).toBe("first-name");
    expect(contract.steps[0].elements[1].fieldId).toBe("last-name");
  });

  it("applies per-child overrides on a block field", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            {
              ref: "blocks/name",
              overrides: {
                "first-name": { label: "Given Name" },
                "last-name": { label: "Family Name", isDisabled: true },
              },
            },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    const [firstName, lastName] = contract.steps[0].elements;

    expect(firstName.fieldId).toBe("first-name");
    expect(firstName.label).toBe("Given Name");

    expect(lastName.fieldId).toBe("last-name");
    expect(lastName.label).toBe("Family Name");
    expect(lastName.isDisabled).toBe(true);
  });

  it("leaves un-overridden children at their original values in a block", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            {
              ref: "blocks/name",
              overrides: {
                "first-name": { label: "Given Name" },
                // last-name: no override
              },
            },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    const lastName = contract.steps[0].elements[1];
    expect(lastName.label).toBe("Last Name");
  });

  it("throws UnknownRefError pointing at an unknown ref's recipe path", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            { ref: "components/unknown-widget" },
            { ref: "components/text" },
          ],
        },
      ],
    });

    expect(() => hydrateForm(recipe, catalog)).toThrow(UnknownRefError);

    try {
      hydrateForm(recipe, catalog);
      throw new Error("expected hydrateForm to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownRefError);
      expect((err as UnknownRefError).unknownRefs).toEqual([
        {
          ref: "components/unknown-widget",
          path: "steps[step-1].elements[0].ref",
        },
      ]);
    }
  });

  it("collects every unknown ref across all steps before throwing", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            { ref: "components/text" },
            { ref: "components/nope-one" },
          ],
        },
        {
          stepId: "step-2",
          title: "Step 2",
          elements: [{ ref: "blocks/nope-two" }],
        },
      ],
    });

    try {
      hydrateForm(recipe, catalog);
      throw new Error("expected hydrateForm to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownRefError);
      expect((err as UnknownRefError).unknownRefs).toEqual([
        { ref: "components/nope-one", path: "steps[step-1].elements[1].ref" },
        { ref: "blocks/nope-two", path: "steps[step-2].elements[0].ref" },
      ]);
    }
  });

  it("expands a custom component ref when it exists in catalog.custom", () => {
    const customCatalog: RegistryCatalog = {
      ...getCatalog(),
      custom: [
        {
          ref: "components/custom-my-widget",
          displayName: "My Widget",
          namespace: "custom",
          type: "my-widget",
          definition: {
            fieldId: "my-widget",
            label: "My Widget",
            htmlType: "text",
          },
        },
      ],
    };

    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/custom-my-widget" }],
        },
      ],
    });

    const contract = hydrateForm(recipe, customCatalog);
    expect(contract.steps[0].elements).toHaveLength(1);
    expect(contract.steps[0].elements[0].fieldId).toBe("my-widget");
    expect(contract.steps[0].elements[0].label).toBe("My Widget");
  });

  it("applies overrides on a custom component ref", () => {
    const customCatalog: RegistryCatalog = {
      ...getCatalog(),
      custom: [
        {
          ref: "components/custom-my-widget",
          displayName: "My Widget",
          namespace: "custom",
          type: "my-widget",
          definition: {
            fieldId: "my-widget",
            label: "My Widget",
            htmlType: "text",
          },
        },
      ],
    };

    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            {
              ref: "components/custom-my-widget",
              overrides: { label: "Custom Label" },
            },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, customCatalog);
    expect(contract.steps[0].elements[0].label).toBe("Custom Label");
  });

  it("forwards step description when present", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          description: "Fill in your details",
          elements: [],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].description).toBe("Fill in your details");
  });

  it("omits step description when absent", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].description).toBeUndefined();
  });

  it("preserves step behaviours in output", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [],
          behaviours: [
            {
              type: "stepConditionalOn",
              targetFieldId: "status",
              targetStepId: "step-0",
              operator: "equal",
              value: "active",
            },
          ],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].behaviours).toEqual([
      {
        type: "stepConditionalOn",
        targetFieldId: "status",
        targetStepId: "step-0",
        operator: "equal",
        value: "active",
      },
    ]);
  });

  it("flattens a block after a component in the same step", () => {
    const recipe = makeRecipe({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/email" }, { ref: "blocks/name" }],
        },
      ],
    });

    const contract = hydrateForm(recipe, catalog);
    expect(contract.steps[0].elements).toHaveLength(3);
    expect(contract.steps[0].elements[0].fieldId).toBe("email");
    expect(contract.steps[0].elements[1].fieldId).toBe("first-name");
    expect(contract.steps[0].elements[2].fieldId).toBe("last-name");
  });

  it("carries contactDetails through to the hydrated contract (issue #452)", () => {
    const contactDetails = {
      title: "Ministry of Health",
      telephoneNumber: "+1 246 555 0100",
      email: "health@gov.bb",
      address: {
        line1: "Jemmotts Lane",
        city: "Bridgetown",
      },
    };
    const recipe = makeRecipe({ contactDetails });
    const contract = hydrateForm(recipe, catalog);

    expect(contract.contactDetails).toEqual(contactDetails);
  });

  it("omits contactDetails when not present in recipe", () => {
    const recipe = makeRecipe();
    const contract = hydrateForm(recipe, catalog);

    expect(contract.contactDetails).toBeUndefined();
  });
});
