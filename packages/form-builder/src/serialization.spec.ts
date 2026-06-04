import { serializeRecipeDraft, deserializeRecipe } from "./serialization";
import { getCatalog } from "./catalog";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import type {
  ContactDetails,
  Processor,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";
import type { RegistryCatalog } from "./catalog";
import type { RecipeDraft, RecipeFieldDraft } from "./types";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeBaseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    formId: "form-001",
    title: "Test Form",
    steps: [],
    ...overrides,
  };
}

// Stamps a deterministic id on a field-draft fixture so tests needn't supply one.
let __idCounter = 0;
function f<T extends Omit<RecipeFieldDraft, "id">>(draft: T): RecipeFieldDraft {
  return { ...draft, id: `test-field-${++__idCounter}` };
}

// ─── serializeRecipeDraft / deserializeRecipe round-trip ───────────────────

describe("serializeRecipeDraft + deserializeRecipe round-trip", () => {
  it("preserves formId and title", () => {
    const draft = makeBaseDraft();
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    expect(result.formId).toBe(draft.formId);
    expect(result.title).toBe(draft.title);
  });

  it("omits description when not present on draft", () => {
    const draft = makeBaseDraft();
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });

    expect(recipe.description).toBeUndefined();
    const result = deserializeRecipe(recipe);
    expect(result.description).toBeUndefined();
  });

  it("preserves description on the draft when present", () => {
    const draft = makeBaseDraft({ description: "A useful form" });
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });

    expect(recipe.description).toBe("A useful form");
    const result = deserializeRecipe(recipe);
    expect(result.description).toBe("A useful form");
  });

  it("does not assert exact createdAt/updatedAt — only that they are strings", () => {
    const draft = makeBaseDraft();
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });

    expect(typeof recipe.createdAt).toBe("string");
    expect(typeof recipe.updatedAt).toBe("string");
  });

  it("a recipe with no processors round-trips with the key absent (no spurious [] or undefined)", () => {
    // deserialize a recipe that has no processors → draft must not carry the key
    const recipe = serializeRecipeDraft(makeBaseDraft(), { version: "1.0.0" });
    expect(Object.keys(recipe)).not.toContain("processors");

    const draft = deserializeRecipe(recipe);
    expect(Object.keys(draft)).not.toContain("processors");

    // serialize that draft again → still no processors key on the wire
    const reserialized = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(reserialized.processors).toBeUndefined();
    expect(Object.keys(reserialized)).not.toContain("processors");
  });

  it("empty steps array survives round-trip", () => {
    const draft = makeBaseDraft({ steps: [] });
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    expect(result.steps).toEqual([]);
  });

  it("component field (kind: 'component') survives round-trip without overrides", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/generic-text",
              overrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].elements[0].ref).toBe("components/generic-text");
    expect(recipe.steps[0].elements[0].overrides).toBeUndefined();

    const result = deserializeRecipe(recipe);
    expect(result.steps[0].fields[0].kind).toBe("component");
    expect(result.steps[0].fields[0].ref).toBe("components/generic-text");
    expect(result.steps[0].fields[0].overrides).toEqual({});
  });

  it("component field with overrides (label, hint, isDisabled, validations.required) survives round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/generic-email",
              overrides: {
                label: "Your Email",
                hint: "Work address preferred",
                isDisabled: true,
                validations: { required: { error: "This field is required" } },
              },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const element = recipe.steps[0].elements[0];
    expect(element.ref).toBe("components/generic-email");
    expect(element.overrides).toEqual({
      label: "Your Email",
      hint: "Work address preferred",
      isDisabled: true,
      validations: { required: { error: "This field is required" } },
    });

    const result = deserializeRecipe(recipe);
    const field = result.steps[0].fields[0];
    expect(field.kind).toBe("component");
    expect(field.overrides).toEqual({
      label: "Your Email",
      hint: "Work address preferred",
      isDisabled: true,
      validations: { required: { error: "This field is required" } },
    });
  });

  it("block field (kind: 'block') survives round-trip without child overrides", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "block",
              ref: "blocks/personal-information",
              overrides: {},
              childOverrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const element = recipe.steps[0].elements[0];
    expect(element.ref).toBe("blocks/personal-information");
    expect(element.overrides).toBeUndefined();

    const result = deserializeRecipe(recipe);
    const field = result.steps[0].fields[0];
    expect(field.kind).toBe("block");
    expect(field.ref).toBe("blocks/personal-information");
    expect(field.childOverrides).toEqual({});
    expect(field.overrides).toEqual({});
  });

  it("block field with child overrides survives round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "block",
              ref: "blocks/personal-information",
              overrides: {},
              childOverrides: {
                "first-name": { label: "Given Name" },
                "last-name": { label: "Family Name", isDisabled: true },
              },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const element = recipe.steps[0].elements[0];
    expect(element.overrides).toEqual({
      "first-name": { label: "Given Name" },
      "last-name": { label: "Family Name", isDisabled: true },
    });

    const result = deserializeRecipe(recipe);
    const field = result.steps[0].fields[0];
    expect(field.kind).toBe("block");
    expect(field.childOverrides).toEqual({
      "first-name": { label: "Given Name" },
      "last-name": { label: "Family Name", isDisabled: true },
    });
  });

  it("custom field requires catalog to detect kind — without catalog it becomes 'component'", () => {
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

    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "custom",
              ref: "components/custom-my-widget",
              overrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].elements[0].ref).toBe("components/custom-my-widget");

    // Without catalog: kind falls back to "component"
    const resultWithoutCatalog = deserializeRecipe(recipe);
    expect(resultWithoutCatalog.steps[0].fields[0].kind).toBe("component");

    // With catalog: kind is correctly detected as "custom"
    const resultWithCatalog = deserializeRecipe(recipe, customCatalog);
    expect(resultWithCatalog.steps[0].fields[0].kind).toBe("custom");
    expect(resultWithCatalog.steps[0].fields[0].ref).toBe(
      "components/custom-my-widget",
    );
  });

  it("description on a step survives round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          description: "Fill in your personal details",
          fields: [],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].description).toBe("Fill in your personal details");

    const result = deserializeRecipe(recipe);
    expect(result.steps[0].description).toBe("Fill in your personal details");
  });

  it("absent description on a step is not forwarded", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].description).toBeUndefined();

    const result = deserializeRecipe(recipe);
    expect(result.steps[0].description).toBeUndefined();
  });

  it("behaviours on steps survive round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [],
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

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].behaviours).toEqual([
      {
        type: "stepConditionalOn",
        targetFieldId: "status",
        targetStepId: "step-0",
        operator: "equal",
        value: "active",
      },
    ]);

    const result = deserializeRecipe(recipe);
    expect(result.steps[0].behaviours).toEqual([
      {
        type: "stepConditionalOn",
        targetFieldId: "status",
        targetStepId: "step-0",
        operator: "equal",
        value: "active",
      },
    ]);
  });

  it("empty behaviours array on step survives round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);
    expect(result.steps[0].behaviours).toEqual([]);
  });

  it("multiple steps with mixed fields survive round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Personal",
          fields: [
            f({
              kind: "component",
              ref: "components/generic-text",
              overrides: { label: "Full Name" },
            }),
            f({
              kind: "block",
              ref: "blocks/personal-information",
              overrides: {},
              childOverrides: {},
            }),
          ],
          behaviours: [],
        },
        {
          stepId: "step-2",
          title: "Contact",
          fields: [
            f({
              kind: "component",
              ref: "components/generic-email",
              overrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].fields[0].ref).toBe("components/generic-text");
    expect(result.steps[0].fields[0].overrides).toEqual({ label: "Full Name" });
    expect(result.steps[0].fields[1].kind).toBe("block");
    expect(result.steps[1].fields[0].ref).toBe("components/generic-email");
  });

  it("deserializeRecipe stamps a unique editor-only id on every field", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/generic-text",
              overrides: {},
            }),
            f({
              kind: "component",
              ref: "components/generic-text",
              overrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    const [a, b] = result.steps[0].fields;
    expect(typeof a.id).toBe("string");
    expect(typeof b.id).toBe("string");
    expect(a.id).not.toBe(b.id);
  });

  it("serializeRecipeDraft does not emit the editor-only id on the wire", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/generic-text",
              overrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const element = recipe.steps[0].elements[0] as Record<string, unknown>;
    expect(element.id).toBeUndefined();
    expect(Object.keys(element)).not.toContain("id");
  });

  it("field-level overrides with only validations.required survive round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/generic-text",
              overrides: { validations: { required: {} } },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    expect(result.steps[0].fields[0].overrides).toEqual({
      validations: { required: {} },
    });
  });
});

// ─── processors round-trip (data-loss fix, issue #255) ─────────────────────

describe("processors round-trip through deserialize/serialize", () => {
  // The three processors with the richest config. Webhook includes its
  // defaulted fields explicitly so the array is a clean identity through both
  // the builder round-trip and serviceContractRecipeSchema parsing.
  const processorsFixture: Processor[] = [
    {
      type: "email",
      config: {
        recipientField: "applicant.email",
        subject: "Your application has been received",
      },
    },
    {
      type: "payment",
      config: {
        provider: "ezpay",
        department: "Treasury",
        paymentCode: "FEE-001",
        amount: 50,
        description: "Application processing fee",
        customerEmailPath: "applicant.email",
        customerNamePath: "applicant.fullName",
        allowCredit: true,
        allowDebit: true,
        allowPayce: false,
      },
    },
    {
      type: "webhook",
      config: {
        url: "https://example.gov.bb/hooks/applications",
        method: "POST",
        headers: { "X-Source": "gov-bb" },
        secret: "supersecretkey1234",
        signatureHeader: "X-Webhook-Signature",
        timeoutMs: 10_000,
      },
    },
  ];

  function makeRecipeWithProcessors(): ServiceContractRecipe {
    return {
      formId: "form-001",
      title: "Test Form",
      version: "1.0.0",
      steps: [],
      processors: processorsFixture,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
  }

  // The non-payment processors, in fixture order. Payment now lives in the DB
  // sibling (#716), so it's stripped from the serialized recipe — every wire
  // assertion below compares against this filtered set, not processorsFixture.
  const nonPaymentProcessors: Processor[] = processorsFixture.filter(
    (p) => p.type !== "payment",
  );

  it("preserves non-payment processors across deserialize → serialize (id-aware: minted on the draft, stripped from the wire)", () => {
    const draft = deserializeRecipe(makeRecipeWithProcessors());
    // The deserialized draft carries minted editor-only ids the persisted
    // recipe must not — so the round-trip is exact only once `id` is stripped.
    expect(draft.processors?.every((p) => typeof p.id === "string")).toBe(true);

    const result = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(result.processors).toEqual(nonPaymentProcessors);
  });

  it("strips every payment processor from the serialized recipe (it's a DB sibling now, #716)", () => {
    const draft = deserializeRecipe(makeRecipeWithProcessors());
    const result = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect((result.processors ?? []).some((p) => p.type === "payment")).toBe(
      false,
    );
  });

  it("collapses to an empty processors array when the draft's only processor is payment", () => {
    const draft = deserializeRecipe({
      ...makeRecipeWithProcessors(),
      processors: [
        processorsFixture.find((p) => p.type === "payment") as Processor,
      ],
    });
    const result = serializeRecipeDraft(draft, { version: "1.0.0" });
    // Present-but-empty (not absent): the draft had a processors field, so the
    // `!== undefined` guard still emits `[]`.
    expect(result.processors).toEqual([]);
  });

  it("serializeRecipeDraft does not emit the editor-only processor id on the wire", () => {
    const draft = deserializeRecipe(makeRecipeWithProcessors());
    const result = serializeRecipeDraft(draft, { version: "1.0.0" });
    for (const p of result.processors ?? []) {
      expect(Object.keys(p)).not.toContain("id");
    }
  });

  it("preserves an explicit empty processors array (not collapsed to absent)", () => {
    // The whole point of the `!== undefined` guard: an explicit `[]` must
    // survive distinct from "no processors field". A truthiness/length check
    // would silently drop it and reintroduce the data-loss bug.
    const recipe: ServiceContractRecipe = {
      ...makeRecipeWithProcessors(),
      processors: [],
    };

    const draft = deserializeRecipe(recipe);
    expect(draft.processors).toEqual([]);

    const result = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(result.processors).toEqual([]);
  });

  it("the serialized recipe (with processors) parses through serviceContractRecipeSchema", () => {
    const draft = deserializeRecipe(makeRecipeWithProcessors());
    const result = serializeRecipeDraft(draft, { version: "1.0.0" });

    const parsed = serviceContractRecipeSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Payment is stripped on serialize (#716), so the wire carries only the
      // non-payment processors.
      expect(parsed.data.processors).toEqual(nonPaymentProcessors);
    }
  });

  it("deserializeRecipe mints a unique editor-only id on every processor", () => {
    const draft = deserializeRecipe(makeRecipeWithProcessors());
    const ids = (draft.processors ?? []).map(
      (p) => (p as Processor & { id?: string }).id,
    );
    expect(ids).toHaveLength(3);
    for (const id of ids) expect(typeof id).toBe("string");
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });
});

// ─── contactDetails round-trip (silent-drop fix, issue #452) ───────────────

describe("contactDetails round-trip through deserialize/serialize", () => {
  const contactDetailsFixture: ContactDetails = {
    title: "Ministry of Health",
    telephoneNumber: "+1 246 555 0100",
    email: "health@gov.bb",
    address: {
      line1: "Jemmotts Lane",
      line2: "St Michael",
      city: "Bridgetown",
      country: "Barbados",
    },
  };

  function makeRecipeWithContactDetails(
    contactDetails: ContactDetails = contactDetailsFixture,
  ): ServiceContractRecipe {
    return {
      formId: "form-001",
      title: "Test Form",
      version: "1.0.0",
      contactDetails,
      steps: [],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
  }

  it("preserves contactDetails (with address) across deserialize → serialize", () => {
    const draft = deserializeRecipe(makeRecipeWithContactDetails());
    expect(draft.contactDetails).toEqual(contactDetailsFixture);

    const result = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(result.contactDetails).toEqual(contactDetailsFixture);
  });

  it("preserves contactDetails without the optional address", () => {
    const noAddress: ContactDetails = {
      title: "Ministry of Health",
      telephoneNumber: "+1 246 555 0100",
      email: "health@gov.bb",
    };
    const draft = deserializeRecipe(makeRecipeWithContactDetails(noAddress));
    const result = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(result.contactDetails).toEqual(noAddress);
    expect(result.contactDetails?.address).toBeUndefined();
  });

  it("a recipe with no contactDetails round-trips with the key absent", () => {
    const recipe = serializeRecipeDraft(makeBaseDraft(), { version: "1.0.0" });
    expect(Object.keys(recipe)).not.toContain("contactDetails");

    const draft = deserializeRecipe(recipe);
    expect(Object.keys(draft)).not.toContain("contactDetails");

    const reserialized = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(reserialized.contactDetails).toBeUndefined();
    expect(Object.keys(reserialized)).not.toContain("contactDetails");
  });

  it("the serialized recipe (with contactDetails) parses through serviceContractRecipeSchema", () => {
    const draft = deserializeRecipe(makeRecipeWithContactDetails());
    const result = serializeRecipeDraft(draft, { version: "1.0.0" });

    const parsed = serviceContractRecipeSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contactDetails).toEqual(contactDetailsFixture);
    }
  });
});

// ─── mdaContactId is DB-only, never on the recipe wire (issue #607) ─────────

describe("mdaContactId serialization", () => {
  it("does NOT emit mdaContactId into the serialized recipe (it's a DB-only sibling field)", () => {
    const draft = makeBaseDraft({ mdaContactId: "contact-123" });
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(Object.keys(recipe)).not.toContain("mdaContactId");
    expect(
      (recipe as unknown as Record<string, unknown>).mdaContactId,
    ).toBeUndefined();
  });

  it("omits mdaContactId even when set to null", () => {
    const draft = makeBaseDraft({ mdaContactId: null });
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(Object.keys(recipe)).not.toContain("mdaContactId");
  });
});
