import type {
  RecipeDraft,
  RecipeFieldDraft,
  RecipeProcessorDraft,
  RecipeStepDraft,
} from "@govtech-bb/form-builder";
import {
  EMPTY_DRAFT,
  REQUIRED_STEP_IDS,
  firstStepId,
  isNoFieldsStep,
  isRequiredStep,
  nextStepId,
  recipeReducer,
} from "./-recipe-reducer";

// ── Fixture helpers ──────────────────────────────────────────────────────────

const editableStep = (
  id: string,
  fields: RecipeFieldDraft[] = [],
): RecipeStepDraft => ({
  stepId: id,
  title: `Title ${id}`,
  description: undefined,
  fields,
  behaviours: [],
});

const baseDraft = () => ({
  formId: "form-1",
  title: "Test Form",
  steps: [] as RecipeStepDraft[],
});

// Narrow a draft processor to its email config (the discriminated union member
// the seeded processors always are), so tests can read recipientField/label.
const emailConfig = (p: RecipeProcessorDraft) => {
  if (p.type !== "email") throw new Error(`expected email, got ${p.type}`);
  return p.config;
};

// ── isRequiredStep ───────────────────────────────────────────────────────────

describe("isRequiredStep", () => {
  it("returns true for 'check-your-answers'", () => {
    expect(isRequiredStep("check-your-answers")).toBe(true);
  });

  it("returns true for 'declaration'", () => {
    expect(isRequiredStep("declaration")).toBe(true);
  });

  it("returns true for 'submission-confirmation'", () => {
    expect(isRequiredStep("submission-confirmation")).toBe(true);
  });

  it("returns false for an arbitrary editable step id", () => {
    expect(isRequiredStep("step-1")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isRequiredStep("")).toBe(false);
  });
});

// ── isNoFieldsStep ───────────────────────────────────────────────────────────

describe("isNoFieldsStep", () => {
  it("returns true for 'check-your-answers'", () => {
    expect(isNoFieldsStep("check-your-answers")).toBe(true);
  });

  it("returns true for 'submission-confirmation'", () => {
    expect(isNoFieldsStep("submission-confirmation")).toBe(true);
  });

  it("returns false for 'declaration' (it bears the confirmation checkbox)", () => {
    expect(isNoFieldsStep("declaration")).toBe(false);
  });

  it("returns false for an arbitrary editable step id", () => {
    expect(isNoFieldsStep("step-1")).toBe(false);
  });
});

// ── firstStepId ──────────────────────────────────────────────────────────────

describe("firstStepId", () => {
  // A required-step fixture, used to assert the helper applies the reducer's
  // [...editable, ...required] ordering rather than naively reading steps[0].
  const requiredStep = (
    id: (typeof REQUIRED_STEP_IDS)[number],
  ): RecipeStepDraft => ({
    stepId: id,
    title: `Title ${id}`,
    description: undefined,
    fields: [],
    behaviours: [],
  });

  it("returns the first editable step's id when editable steps exist", () => {
    const draft = {
      ...baseDraft(),
      steps: [editableStep("step-1"), editableStep("step-2")],
    };
    expect(firstStepId(draft)).toBe("step-1");
  });

  it("returns the first editable step even when a required step precedes it in the array", () => {
    // Mirrors the pre-normalization draft handed to the load handlers: a
    // required step can appear before the editable ones. The helper must use
    // the editable-first ordering rule, not steps[0].
    const draft = {
      ...baseDraft(),
      steps: [
        requiredStep("check-your-answers"),
        editableStep("step-1"),
        editableStep("step-2"),
      ],
    };
    expect(firstStepId(draft)).toBe("step-1");
  });

  it("falls back to the first step overall when only required steps exist", () => {
    const draft = {
      ...baseDraft(),
      steps: [
        requiredStep("check-your-answers"),
        requiredStep("declaration"),
        requiredStep("submission-confirmation"),
      ],
    };
    expect(firstStepId(draft)).toBe("check-your-answers");
  });

  it("returns null when the draft has no steps", () => {
    const draft = { ...baseDraft(), steps: [] };
    expect(firstStepId(draft)).toBeNull();
  });
});

// ── EMPTY_DRAFT ──────────────────────────────────────────────────────────────

describe("EMPTY_DRAFT", () => {
  it("seeds exactly the three required steps", () => {
    const ids = EMPTY_DRAFT.steps.map((s) => s.stepId);
    expect(ids).toEqual([
      "check-your-answers",
      "declaration",
      "submission-confirmation",
    ]);
  });

  it("seeds required steps in canonical order", () => {
    expect(EMPTY_DRAFT.steps[0].stepId).toBe(REQUIRED_STEP_IDS[0]);
    expect(EMPTY_DRAFT.steps[1].stepId).toBe(REQUIRED_STEP_IDS[1]);
    expect(EMPTY_DRAFT.steps[2].stepId).toBe(REQUIRED_STEP_IDS[2]);
  });

  it("seeds check-your-answers with its review title and description", () => {
    const cya = EMPTY_DRAFT.steps[0];
    expect(cya.stepId).toBe("check-your-answers");
    expect(cya.title).toBe("Check your answers");
    expect(cya.description).toBe(
      "Review all the information you have provided before submitting your application.",
    );
  });

  it("seeds the declaration step with the single confirmation checkbox", () => {
    const decl = EMPTY_DRAFT.steps[1];
    expect(decl.stepId).toBe("declaration");
    expect(decl.fields).toHaveLength(1);
    const field = decl.fields[0];
    expect(field.kind).toBe("component");
    expect(field.ref).toBe("components/confirmation");
    expect(field.overrides.fieldId).toBe("declaration-confirmed");
    expect(field.overrides.label).toBe("Declaration");
    expect(field.overrides.validations?.required).toEqual({
      value: true,
      error: "You must confirm the declaration to continue",
    });
  });

  it("gives the seeded declaration field a non-empty editor id", () => {
    const field = EMPTY_DRAFT.steps[1].fields[0];
    expect(typeof field.id).toBe("string");
    expect(field.id).not.toBe("");
  });

  it("seeds exactly one email processor", () => {
    expect(EMPTY_DRAFT.processors).toHaveLength(1);
    expect(EMPTY_DRAFT.processors!.every((p) => p.type === "email")).toBe(true);
  });

  it("does not seed a blank-recipient processor", () => {
    for (const p of EMPTY_DRAFT.processors!) {
      expect(emailConfig(p).recipientField).not.toBe("");
    }
  });

  it("seeds an MDA Email targeting contactDetails.email", () => {
    const config = emailConfig(EMPTY_DRAFT.processors![0]);
    expect(config.label).toBe("MDA Email");
    expect(config.recipientField).toBe("contactDetails.email");
    expect(config.subject).toBeTruthy();
  });

  it("gives each seeded processor a non-empty id", () => {
    for (const p of EMPTY_DRAFT.processors!) {
      expect(typeof p.id).toBe("string");
      expect(p.id).not.toBe("");
    }
  });

  it("defaults visibility to 'draft' so a new form never launches by accident (#1682)", () => {
    expect(EMPTY_DRAFT.meta).toEqual({ visibility: "draft" });
  });
});

// ── SET_VISIBILITY ───────────────────────────────────────────────────────────

describe("SET_VISIBILITY", () => {
  it("sets meta.visibility on a draft that already has meta", () => {
    const state = { ...baseDraft(), meta: { visibility: "draft" as const } };
    const result = recipeReducer(state, {
      type: "SET_VISIBILITY",
      visibility: "public",
    });
    expect(result.meta).toEqual({ visibility: "public" });
  });

  it("seeds meta when a legacy draft has none (loaded without it)", () => {
    const state = baseDraft();
    expect((state as RecipeDraft).meta).toBeUndefined();
    const result = recipeReducer(state, {
      type: "SET_VISIBILITY",
      visibility: "preview",
    });
    expect(result.meta).toEqual({ visibility: "preview" });
  });

  it("does not mutate the input draft", () => {
    const state = { ...baseDraft(), meta: { visibility: "draft" as const } };
    recipeReducer(state, { type: "SET_VISIBILITY", visibility: "public" });
    expect(state.meta).toEqual({ visibility: "draft" });
  });
});

// ── RESET ────────────────────────────────────────────────────────────────────

describe("RESET", () => {
  it("returns a fresh draft containing only the three required steps", () => {
    const withExtras = {
      ...baseDraft(),
      steps: [
        editableStep("step-1"),
        editableStep("step-2"),
        ...EMPTY_DRAFT.steps,
      ],
    };
    const result = recipeReducer(withExtras, { type: "RESET" });
    expect(result.steps.map((s) => s.stepId)).toEqual([
      "check-your-answers",
      "declaration",
      "submission-confirmation",
    ]);
  });

  it("resets formId and title to empty strings", () => {
    const result = recipeReducer(
      { ...baseDraft(), steps: [...EMPTY_DRAFT.steps] },
      { type: "RESET" },
    );
    expect(result.formId).toBe("");
    expect(result.title).toBe("");
  });

  it("resets visibility to 'draft' so a new form never launches by accident (#1682)", () => {
    const result = recipeReducer(
      { ...baseDraft(), meta: { visibility: "public" as const } },
      { type: "RESET" },
    );
    expect(result.meta).toEqual({ visibility: "draft" });
  });

  it("yields independent array references on consecutive resets", () => {
    const state = { ...baseDraft(), steps: [...EMPTY_DRAFT.steps] };
    const first = recipeReducer(state, { type: "RESET" });
    const second = recipeReducer(state, { type: "RESET" });
    expect(first.steps).not.toBe(second.steps);
  });

  it("re-seeds the labelled MDA Email processor", () => {
    const result = recipeReducer(
      { ...baseDraft(), steps: [...EMPTY_DRAFT.steps] },
      { type: "RESET" },
    );
    expect(result.processors).toHaveLength(1);
    expect(result.processors!.map((p) => emailConfig(p).label)).toEqual([
      "MDA Email",
    ]);
  });

  it("re-seeds the declaration confirmation field with a fresh id on consecutive resets", () => {
    const state = { ...baseDraft(), steps: [...EMPTY_DRAFT.steps] };
    const first = recipeReducer(state, { type: "RESET" });
    const second = recipeReducer(state, { type: "RESET" });
    const firstDecl = first.steps.find((s) => s.stepId === "declaration")!;
    const secondDecl = second.steps.find((s) => s.stepId === "declaration")!;
    expect(firstDecl.fields).toHaveLength(1);
    expect(firstDecl.fields[0].ref).toBe("components/confirmation");
    expect(firstDecl.fields[0].id).not.toBe(secondDecl.fields[0].id);
  });

  it("re-seeds processors with fresh ids on consecutive resets", () => {
    const state = { ...baseDraft(), steps: [...EMPTY_DRAFT.steps] };
    const first = recipeReducer(state, { type: "RESET" });
    const second = recipeReducer(state, { type: "RESET" });
    const firstIds = first.processors!.map((p) => p.id);
    const secondIds = second.processors!.map((p) => p.id);
    expect(firstIds[0]).not.toBe(secondIds[0]);
  });
});

// ── REMOVE_STEP ──────────────────────────────────────────────────────────────

describe("REMOVE_STEP", () => {
  const state = {
    ...baseDraft(),
    steps: [editableStep("step-1"), ...EMPTY_DRAFT.steps],
  };

  it("returns state unchanged when stepId is 'declaration'", () => {
    const result = recipeReducer(state, {
      type: "REMOVE_STEP",
      stepId: "declaration",
    });
    expect(result).toBe(state);
  });

  it("returns state unchanged when stepId is 'submission-confirmation'", () => {
    const result = recipeReducer(state, {
      type: "REMOVE_STEP",
      stepId: "submission-confirmation",
    });
    expect(result).toBe(state);
  });

  it("removes a non-required step by id", () => {
    const result = recipeReducer(state, {
      type: "REMOVE_STEP",
      stepId: "step-1",
    });
    const ids = result.steps.map((s) => s.stepId);
    expect(ids).not.toContain("step-1");
    expect(ids).toContain("declaration");
    expect(ids).toContain("submission-confirmation");
  });
});

// ── ADD_STEP ─────────────────────────────────────────────────────────────────

describe("ADD_STEP", () => {
  it("inserts a new step at index 0 when only the required steps are present", () => {
    // With only the required tail, there are no step-N ids, so nextStepId
    // returns "step-1".
    const state = { ...baseDraft(), steps: [...EMPTY_DRAFT.steps] };
    const result = recipeReducer(state, { type: "ADD_STEP" });
    expect(result.steps[0].stepId).toBe("step-1");
    // Required steps still present at the tail
    expect(result.steps[1].stepId).toBe("check-your-answers");
    expect(result.steps[2].stepId).toBe("declaration");
    expect(result.steps[3].stepId).toBe("submission-confirmation");
  });

  it("inserts at index 2 (between editable and required) when 2 editable + 3 required steps exist", () => {
    const state = {
      ...baseDraft(),
      steps: [
        editableStep("step-1"),
        editableStep("step-2"),
        ...EMPTY_DRAFT.steps,
      ],
    };
    const result = recipeReducer(state, { type: "ADD_STEP" });
    // New step should be at index 2, before the required tail
    expect(result.steps.length).toBe(6);
    expect(result.steps[2].stepId).toBe("step-3");
    expect(result.steps[3].stepId).toBe("check-your-answers");
    expect(result.steps[4].stepId).toBe("declaration");
    expect(result.steps[5].stepId).toBe("submission-confirmation");
  });
});

// ── REORDER_STEPS ────────────────────────────────────────────────────────────

describe("REORDER_STEPS", () => {
  // State: [step-1(0), step-2(1), check-your-answers(2), declaration(3),
  // submission-confirmation(4)]
  const state = {
    ...baseDraft(),
    steps: [
      editableStep("step-1"),
      editableStep("step-2"),
      ...EMPTY_DRAFT.steps,
    ],
  };

  it("refuses a move where toIndex is in the required tail (editable → check-your-answers slot)", () => {
    // Trying to move step-1 to index 2 (check-your-answers' position)
    const result = recipeReducer(state, {
      type: "REORDER_STEPS",
      fromIndex: 0,
      toIndex: 2,
    });
    expect(result).toBe(state);
  });

  it("refuses a move where fromIndex is in the required tail", () => {
    // Trying to move declaration (index 3) to index 0
    const result = recipeReducer(state, {
      type: "REORDER_STEPS",
      fromIndex: 3,
      toIndex: 0,
    });
    expect(result).toBe(state);
  });

  it("allows reordering among editable steps", () => {
    // Swap step-1 (index 0) and step-2 (index 1)
    const result = recipeReducer(state, {
      type: "REORDER_STEPS",
      fromIndex: 0,
      toIndex: 1,
    });
    expect(result.steps[0].stepId).toBe("step-2");
    expect(result.steps[1].stepId).toBe("step-1");
    // Required steps remain at tail
    expect(result.steps[2].stepId).toBe("check-your-answers");
    expect(result.steps[3].stepId).toBe("declaration");
    expect(result.steps[4].stepId).toBe("submission-confirmation");
  });
});

// ── REORDER_FIELDS ────────────────────────────────────────────────────────────
// Drag-and-drop performs multi-position moves, not just adjacent swaps, so the
// reducer must splice (remove + insert), preserving the order of every other
// field. The arrow buttons dispatch adjacent moves, which splice handles too.

describe("REORDER_FIELDS", () => {
  const field = (id: string): RecipeFieldDraft => ({
    id,
    kind: "component",
    ref: "components/generic-text",
    overrides: {},
  });

  // step-1 fields: [a(0), b(1), c(2), d(3), e(4)]
  const stateWith = (...ids: string[]) => ({
    ...baseDraft(),
    steps: [editableStep("step-1", ids.map(field)), ...EMPTY_DRAFT.steps],
  });

  const order = (result: RecipeDraft) =>
    result.steps[0].fields.map((f) => f.id);

  it("moves a field forward across several positions (e at 4 → 0)", () => {
    const result = recipeReducer(stateWith("a", "b", "c", "d", "e"), {
      type: "REORDER_FIELDS",
      stepId: "step-1",
      fromIndex: 4,
      toIndex: 0,
    });
    expect(order(result)).toEqual(["e", "a", "b", "c", "d"]);
  });

  it("moves a field backward across several positions (a at 0 → 4)", () => {
    const result = recipeReducer(stateWith("a", "b", "c", "d", "e"), {
      type: "REORDER_FIELDS",
      stepId: "step-1",
      fromIndex: 0,
      toIndex: 4,
    });
    expect(order(result)).toEqual(["b", "c", "d", "e", "a"]);
  });

  it("moves a field to a middle position (b at 1 → 3)", () => {
    const result = recipeReducer(stateWith("a", "b", "c", "d", "e"), {
      type: "REORDER_FIELDS",
      stepId: "step-1",
      fromIndex: 1,
      toIndex: 3,
    });
    expect(order(result)).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("still handles an adjacent move (arrow-button behaviour preserved)", () => {
    const result = recipeReducer(stateWith("a", "b", "c"), {
      type: "REORDER_FIELDS",
      stepId: "step-1",
      fromIndex: 1,
      toIndex: 0,
    });
    expect(order(result)).toEqual(["b", "a", "c"]);
  });

  it("only reorders the targeted step, leaving others untouched", () => {
    const state = {
      ...baseDraft(),
      steps: [
        editableStep("step-1", ["a", "b"].map(field)),
        editableStep("step-2", ["x", "y"].map(field)),
        ...EMPTY_DRAFT.steps,
      ],
    };
    const result = recipeReducer(state, {
      type: "REORDER_FIELDS",
      stepId: "step-1",
      fromIndex: 0,
      toIndex: 1,
    });
    expect(result.steps[0].fields.map((f) => f.id)).toEqual(["b", "a"]);
    expect(result.steps[1].fields.map((f) => f.id)).toEqual(["x", "y"]);
  });
});

// ── LOAD_DRAFT ───────────────────────────────────────────────────────────────

describe("LOAD_DRAFT", () => {
  it("appends all required steps in canonical order when draft lacks them", () => {
    const draft = {
      ...baseDraft(),
      steps: [editableStep("step-1"), editableStep("step-2")],
    };
    const result = recipeReducer(
      { ...baseDraft(), steps: [] },
      { type: "LOAD_DRAFT", draft },
    );
    const ids = result.steps.map((s) => s.stepId);
    expect(ids).toEqual([
      "step-1",
      "step-2",
      "check-your-answers",
      "declaration",
      "submission-confirmation",
    ]);
  });

  it("seeds a missing declaration step with the single confirmation checkbox (migration path)", () => {
    const draft = {
      ...baseDraft(),
      steps: [editableStep("step-1"), editableStep("step-2")],
    };
    const result = recipeReducer(
      { ...baseDraft(), steps: [] },
      { type: "LOAD_DRAFT", draft },
    );
    const decl = result.steps.find((s) => s.stepId === "declaration")!;
    expect(decl.fields).toHaveLength(1);
    expect(decl.fields[0].kind).toBe("component");
    expect(decl.fields[0].ref).toBe("components/confirmation");
    expect(decl.fields[0].overrides.fieldId).toBe("declaration-confirmed");
    expect(decl.fields[0].overrides.label).toBe("Declaration");
    expect(decl.fields[0].overrides.validations?.required).toEqual({
      value: true,
      error: "You must confirm the declaration to continue",
    });
  });

  it("preserves an existing declaration step's fields untouched (no re-seed)", () => {
    // An author may have customised or emptied the declaration step; loading
    // must keep whatever is there — the seed applies only when the step is
    // missing entirely.
    const emptyDeclaration: RecipeStepDraft = {
      stepId: "declaration",
      title: "Declaration",
      description: undefined,
      fields: [],
      behaviours: [],
    };
    const draft = {
      ...baseDraft(),
      steps: [editableStep("step-1"), emptyDeclaration],
    };
    const result = recipeReducer(
      { ...baseDraft(), steps: [] },
      { type: "LOAD_DRAFT", draft },
    );
    const decl = result.steps.find((s) => s.stepId === "declaration");
    expect(decl?.fields).toEqual([]);
  });

  it("seeds a missing check-your-answers with its default title/description (migration path)", () => {
    // A recipe saved before check-your-answers became authored has only
    // declaration + submission-confirmation. Opening it must materialise
    // check-your-answers with sensible defaults, before declaration.
    const draft = {
      ...baseDraft(),
      steps: [
        editableStep("step-1"),
        {
          stepId: "declaration" as const,
          title: "Declaration",
          description: undefined,
          fields: [],
          behaviours: [],
        },
        {
          stepId: "submission-confirmation" as const,
          title: "Submission Confirmation",
          description: undefined,
          fields: [],
          behaviours: [],
        },
      ],
    };
    const result = recipeReducer(
      { ...baseDraft(), steps: [] },
      { type: "LOAD_DRAFT", draft },
    );
    expect(result.steps.map((s) => s.stepId)).toEqual([
      "step-1",
      "check-your-answers",
      "declaration",
      "submission-confirmation",
    ]);
    const cya = result.steps.find((s) => s.stepId === "check-your-answers");
    expect(cya?.title).toBe("Check your answers");
    expect(cya?.description).toBe(
      "Review all the information you have provided before submitting your application.",
    );
  });

  it("preserves a check-your-answers step that already carries author edits", () => {
    const customCya: RecipeStepDraft = {
      stepId: "check-your-answers",
      title: "Review your details",
      description: "Have a final look before you submit.",
      fields: [],
      behaviours: [],
    };
    const draft = {
      ...baseDraft(),
      steps: [editableStep("step-1"), customCya, ...EMPTY_DRAFT.steps.slice(1)],
    };
    const result = recipeReducer(
      { ...baseDraft(), steps: [] },
      { type: "LOAD_DRAFT", draft },
    );
    const cya = result.steps.find((s) => s.stepId === "check-your-answers");
    expect(cya?.title).toBe("Review your details");
    expect(cya?.description).toBe("Have a final look before you submit.");
  });

  it("normalises required steps to canonical order at the tail when they appear in reverse order", () => {
    // submission-confirmation appears before declaration in the incoming draft
    const draft = {
      ...baseDraft(),
      steps: [
        editableStep("step-1"),
        {
          stepId: "submission-confirmation" as const,
          title: "Submission Confirmation",
          description: undefined,
          fields: [],
          behaviours: [],
        },
        {
          stepId: "declaration" as const,
          title: "Declaration",
          description: undefined,
          fields: [],
          behaviours: [],
        },
      ],
    };
    const result = recipeReducer(
      { ...baseDraft(), steps: [] },
      { type: "LOAD_DRAFT", draft },
    );
    const ids = result.steps.map((s) => s.stepId);
    expect(ids).toEqual([
      "step-1",
      "check-your-answers",
      "declaration",
      "submission-confirmation",
    ]);
  });

  it("moves required steps from the middle to the tail", () => {
    const draft = {
      ...baseDraft(),
      steps: [
        editableStep("step-1"),
        {
          stepId: "declaration" as const,
          title: "Declaration",
          description: undefined,
          fields: [],
          behaviours: [],
        },
        editableStep("step-2"),
        {
          stepId: "submission-confirmation" as const,
          title: "Submission Confirmation",
          description: undefined,
          fields: [],
          behaviours: [],
        },
        editableStep("step-3"),
      ],
    };
    const result = recipeReducer(
      { ...baseDraft(), steps: [] },
      { type: "LOAD_DRAFT", draft },
    );
    const ids = result.steps.map((s) => s.stepId);
    // Editable steps keep their relative order; required steps move to tail
    expect(ids).toEqual([
      "step-1",
      "step-2",
      "step-3",
      "check-your-answers",
      "declaration",
      "submission-confirmation",
    ]);
  });

  it("preserves user data on existing required steps (custom title, pre-populated fields)", () => {
    const customDeclaration: RecipeStepDraft = {
      stepId: "declaration",
      title: "Custom Declaration Title",
      description: "Please read carefully",
      fields: [],
      behaviours: [],
    };
    const draft = {
      ...baseDraft(),
      steps: [
        editableStep("step-1"),
        customDeclaration,
        // slice(2) is [submission-confirmation]; check-your-answers is seeded.
        ...EMPTY_DRAFT.steps.slice(2),
      ],
    };
    const result = recipeReducer(
      { ...baseDraft(), steps: [] },
      { type: "LOAD_DRAFT", draft },
    );
    const declStep = result.steps.find((s) => s.stepId === "declaration");
    expect(declStep?.title).toBe("Custom Declaration Title");
    expect(declStep?.description).toBe("Please read carefully");
  });
});

// ── Per-instance field overrides (regression: issue #194) ──────────────────
// Pins id-keyed lookups so overrides on one instance don't cascade to siblings.

describe("per-instance field overrides (id-keyed)", () => {
  function fieldWithId(
    id: string,
    ref: string,
    overrides: Record<string, unknown> = {},
  ): RecipeFieldDraft {
    return {
      id,
      kind: "component",
      ref,
      overrides: overrides as RecipeFieldDraft["overrides"],
    };
  }

  describe("ADD_FIELD", () => {
    it("mints a fresh id on each ADD_FIELD so two instances of the same ref are distinguishable", () => {
      const state = {
        ...baseDraft(),
        steps: [editableStep("step-1"), ...EMPTY_DRAFT.steps],
      };
      const after1 = recipeReducer(state, {
        type: "ADD_FIELD",
        stepId: "step-1",
        field: {
          kind: "component",
          ref: "components/generic-text",
          overrides: {},
        },
      });
      const after2 = recipeReducer(after1, {
        type: "ADD_FIELD",
        stepId: "step-1",
        field: {
          kind: "component",
          ref: "components/generic-text",
          overrides: {},
        },
      });

      const fields = after2.steps[0].fields;
      expect(fields).toHaveLength(2);
      expect(typeof fields[0].id).toBe("string");
      expect(typeof fields[1].id).toBe("string");
      expect(fields[0].id).not.toBe(fields[1].id);
      expect(fields[0].ref).toBe(fields[1].ref);
    });
  });

  describe("UPDATE_FIELD_OVERRIDES", () => {
    it("updates only the targeted instance when two fields share a ref", () => {
      const a = fieldWithId("id-a", "components/generic-text", {});
      const b = fieldWithId("id-b", "components/generic-text", {});
      const state = {
        ...baseDraft(),
        steps: [editableStep("step-1", [a, b]), ...EMPTY_DRAFT.steps],
      };

      const result = recipeReducer(state, {
        type: "UPDATE_FIELD_OVERRIDES",
        stepId: "step-1",
        fieldId: "id-a",
        overrides: { label: "Only A" },
      });

      const [resA, resB] = result.steps[0].fields;
      expect(resA.id).toBe("id-a");
      expect(resA.overrides).toEqual({ label: "Only A" });
      expect(resB.id).toBe("id-b");
      expect(resB.overrides).toEqual({});
    });
  });

  describe("CHANGE_FIELD_REF", () => {
    it("replaces the ref and overrides of only the targeted instance", () => {
      const a = fieldWithId("id-a", "components/generic-text", {
        label: "Keep me",
      });
      const b = fieldWithId("id-b", "components/generic-text", {
        label: "Untouched",
      });
      const state = {
        ...baseDraft(),
        steps: [editableStep("step-1", [a, b]), ...EMPTY_DRAFT.steps],
      };

      const result = recipeReducer(state, {
        type: "CHANGE_FIELD_REF",
        stepId: "step-1",
        fieldId: "id-a",
        ref: "components/generic-textarea",
        overrides: { label: "Keep me" },
      });

      const [resA, resB] = result.steps[0].fields;
      expect(resA.id).toBe("id-a");
      expect(resA.ref).toBe("components/generic-textarea");
      expect(resA.overrides).toEqual({ label: "Keep me" });
      // The other instance keeps its original ref and overrides.
      expect(resB.ref).toBe("components/generic-text");
      expect(resB.overrides).toEqual({ label: "Untouched" });
    });

    it("normalizes kind to 'component' (swaps always target a generic primitive)", () => {
      const custom: RecipeFieldDraft = {
        id: "id-c",
        kind: "custom",
        ref: "components/custom-widget",
        overrides: {},
      };
      const state = {
        ...baseDraft(),
        steps: [editableStep("step-1", [custom]), ...EMPTY_DRAFT.steps],
      };

      const result = recipeReducer(state, {
        type: "CHANGE_FIELD_REF",
        stepId: "step-1",
        fieldId: "id-c",
        ref: "components/generic-text",
        overrides: {},
      });

      expect(result.steps[0].fields[0].kind).toBe("component");
      expect(result.steps[0].fields[0].ref).toBe("components/generic-text");
    });

    it("leaves other steps untouched", () => {
      const a = fieldWithId("id-a", "components/generic-text", {});
      const state = {
        ...baseDraft(),
        steps: [
          editableStep("step-1", [a]),
          editableStep("step-2", []),
          ...EMPTY_DRAFT.steps,
        ],
      };

      const result = recipeReducer(state, {
        type: "CHANGE_FIELD_REF",
        stepId: "step-1",
        fieldId: "id-a",
        ref: "components/generic-number",
        overrides: {},
      });

      expect(result.steps[1].stepId).toBe("step-2");
      expect(result.steps[0].fields[0].ref).toBe("components/generic-number");
    });
  });

  describe("REMOVE_FIELD", () => {
    it("removes only the targeted instance when two fields share a ref", () => {
      const a = fieldWithId("id-a", "components/generic-text", { label: "A" });
      const b = fieldWithId("id-b", "components/generic-text", { label: "B" });
      const state = {
        ...baseDraft(),
        steps: [editableStep("step-1", [a, b]), ...EMPTY_DRAFT.steps],
      };

      const result = recipeReducer(state, {
        type: "REMOVE_FIELD",
        stepId: "step-1",
        fieldId: "id-a",
      });

      const remaining = result.steps[0].fields;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("id-b");
      expect(remaining[0].overrides).toEqual({ label: "B" });
    });
  });
});

// ── nextStepId (integration) ─────────────────────────────────────────────────

describe("nextStepId", () => {
  it("returns 'step-1' when no step-N ids exist", () => {
    const steps = [...EMPTY_DRAFT.steps];
    expect(nextStepId(steps)).toBe("step-1");
  });

  it("returns 'step-3' when step-1 and step-2 already exist", () => {
    const steps = [
      editableStep("step-1"),
      editableStep("step-2"),
      ...EMPTY_DRAFT.steps,
    ];
    expect(nextStepId(steps)).toBe("step-3");
  });

  it("fills from max+1, not first gap", () => {
    // step-1 and step-3 exist; should return step-4 (max is 3)
    const steps = [editableStep("step-1"), editableStep("step-3")];
    expect(nextStepId(steps)).toBe("step-4");
  });
});

// ── ADD_PROCESSOR ────────────────────────────────────────────────────────────

describe("ADD_PROCESSOR", () => {
  it("appends a default processor of the given type with a minted id", () => {
    const next = recipeReducer(baseDraft(), {
      type: "ADD_PROCESSOR",
      processorType: "email",
    });
    expect(next.processors).toHaveLength(1);
    expect(next.processors![0].type).toBe("email");
    expect(next.processors![0].config).toEqual({ recipientField: "" });
    expect(typeof next.processors![0].id).toBe("string");
    expect(next.processors![0].id).not.toBe("");
  });

  it("initialises the processors array when it is absent", () => {
    const state: RecipeDraft = baseDraft();
    expect(state.processors).toBeUndefined();
    const next = recipeReducer(state, {
      type: "ADD_PROCESSOR",
      processorType: "webhook",
    });
    expect(next.processors).toHaveLength(1);
    expect(next.processors![0].type).toBe("webhook");
  });

  it("appends to existing processors with a fresh unique id", () => {
    const a = recipeReducer(baseDraft(), {
      type: "ADD_PROCESSOR",
      processorType: "email",
    });
    const b = recipeReducer(a, {
      type: "ADD_PROCESSOR",
      processorType: "webhook",
    });
    expect(b.processors!.map((p) => p.type)).toEqual(["email", "webhook"]);
    expect(b.processors![0].id).not.toBe(b.processors![1].id);
  });
});

// ── REMOVE_PROCESSOR ─────────────────────────────────────────────────────────

describe("REMOVE_PROCESSOR", () => {
  it("removes only the processor with the matching id", () => {
    const a = recipeReducer(baseDraft(), {
      type: "ADD_PROCESSOR",
      processorType: "email",
    });
    const b = recipeReducer(a, {
      type: "ADD_PROCESSOR",
      processorType: "webhook",
    });
    const next = recipeReducer(b, {
      type: "REMOVE_PROCESSOR",
      id: b.processors![0].id,
    });
    expect(next.processors!.map((p) => p.type)).toEqual(["webhook"]);
  });

  it("is a no-op when the array is absent", () => {
    const next = recipeReducer(baseDraft(), {
      type: "REMOVE_PROCESSOR",
      id: "nope",
    });
    expect(next.processors).toBeUndefined();
  });

  it("collapses to undefined when the last processor is removed (#333)", () => {
    const a = recipeReducer(baseDraft(), {
      type: "ADD_PROCESSOR",
      processorType: "email",
    });
    const next = recipeReducer(a, {
      type: "REMOVE_PROCESSOR",
      id: a.processors![0].id,
    });
    expect(next.processors).toBeUndefined();
  });
});

// ── UPDATE_PROCESSOR_CONFIG ──────────────────────────────────────────────────

describe("UPDATE_PROCESSOR_CONFIG", () => {
  it("replaces the matched processor's config with the provided config", () => {
    const a = recipeReducer(baseDraft(), {
      type: "ADD_PROCESSOR",
      processorType: "email",
    });
    const id = a.processors![0].id;
    const next = recipeReducer(a, {
      type: "UPDATE_PROCESSOR_CONFIG",
      id,
      config: { recipientField: "applicant.email", subject: "Hello" },
    });
    expect(next.processors![0].config).toEqual({
      recipientField: "applicant.email",
      subject: "Hello",
    });
  });

  it("stores the config exactly as given, so a caller-spread webhook secret survives", () => {
    // A webhook loaded from an existing recipe carries a `secret` the builder
    // never renders. The config form spreads the existing config (carrying the
    // secret) and overrides only the url; the reducer stores that verbatim.
    const start: RecipeDraft = {
      ...baseDraft(),
      processors: [
        {
          id: "wh-1",
          type: "webhook",
          config: {
            url: "https://old.example.gov.bb/hook",
            method: "POST",
            secret: "supersecretkey1234",
            signatureHeader: "X-Webhook-Signature",
            timeoutMs: 10000,
          },
        },
      ],
    };
    const merged = {
      ...start.processors![0].config,
      url: "https://new.example.gov.bb/hook",
    };
    const next = recipeReducer(start, {
      type: "UPDATE_PROCESSOR_CONFIG",
      id: "wh-1",
      config: merged,
    });
    const cfg = next.processors![0].config as {
      url: string;
      secret?: string;
    };
    expect(cfg.url).toBe("https://new.example.gov.bb/hook");
    expect(cfg.secret).toBe("supersecretkey1234");
  });

  it("replaces rather than merges, so a key-value editor can drop a key", () => {
    // spreadsheet/opencrvs configs are edited as a key-value record: removing
    // a row must remove the key. The editor emits the full remaining record;
    // replace honours it.
    const start: RecipeDraft = {
      ...baseDraft(),
      processors: [
        {
          id: "sp-1",
          type: "spreadsheet",
          config: { filename: "submissions" },
        },
      ],
    };
    const next = recipeReducer(start, {
      type: "UPDATE_PROCESSOR_CONFIG",
      id: "sp-1",
      config: {},
    });
    expect(next.processors![0].config).toEqual({});
  });

  it("leaves processors untouched when no id matches", () => {
    const a = recipeReducer(baseDraft(), {
      type: "ADD_PROCESSOR",
      processorType: "email",
    });
    const next = recipeReducer(a, {
      type: "UPDATE_PROCESSOR_CONFIG",
      id: "does-not-exist",
      config: { recipientField: "x" },
    });
    expect(next.processors![0].config).toEqual({ recipientField: "" });
  });
});

// ── UPDATE_CONTACT_DETAILS ───────────────────────────────────────────────────

describe("UPDATE_CONTACT_DETAILS", () => {
  const contactDetails = {
    title: "Ministry of Health",
    telephoneNumber: "+1 246 555 0100",
    email: "health@gov.bb",
    address: { line1: "Jemmotts Lane", city: "Bridgetown" },
  };

  it("sets contactDetails on the draft", () => {
    const next = recipeReducer(baseDraft(), {
      type: "UPDATE_CONTACT_DETAILS",
      contactDetails,
    });
    expect(next.contactDetails).toEqual(contactDetails);
  });

  it("replaces existing contactDetails wholesale", () => {
    const start: RecipeDraft = { ...baseDraft(), contactDetails };
    const replacement = {
      title: "Ministry of Finance",
      telephoneNumber: "+1 246 555 0200",
      email: "finance@gov.bb",
    };
    const next = recipeReducer(start, {
      type: "UPDATE_CONTACT_DETAILS",
      contactDetails: replacement,
    });
    expect(next.contactDetails).toEqual(replacement);
    expect(next.contactDetails?.address).toBeUndefined();
  });

  it("clears contactDetails back to absent when passed undefined", () => {
    const start: RecipeDraft = { ...baseDraft(), contactDetails };
    const next = recipeReducer(start, {
      type: "UPDATE_CONTACT_DETAILS",
      contactDetails: undefined,
    });
    expect(next.contactDetails).toBeUndefined();
    expect(Object.keys(next)).not.toContain("contactDetails");
  });
});

// ── SET_MDA_CONTACT (issue #607) ─────────────────────────────────────────────

describe("SET_MDA_CONTACT", () => {
  it("records the selected MDA contact id on the draft", () => {
    const next = recipeReducer(baseDraft(), {
      type: "SET_MDA_CONTACT",
      mdaContactId: "contact-123",
    });
    expect(next.mdaContactId).toBe("contact-123");
  });

  it("clears the selection with null", () => {
    const start: RecipeDraft = { ...baseDraft(), mdaContactId: "contact-123" };
    const next = recipeReducer(start, {
      type: "SET_MDA_CONTACT",
      mdaContactId: null,
    });
    expect(next.mdaContactId).toBeNull();
  });

  it("leaves the rest of the draft untouched", () => {
    const start: RecipeDraft = {
      ...baseDraft(),
      contactDetails: { email: "mda@gov.bb" },
    };
    const next = recipeReducer(start, {
      type: "SET_MDA_CONTACT",
      mdaContactId: "contact-9",
    });
    expect(next.contactDetails).toEqual({ email: "mda@gov.bb" });
    expect(next.formId).toBe("form-1");
  });
});
