import type {
  RecipeFieldDraft,
  RecipeStepDraft,
} from "@govtech-bb/form-builder";
import {
  EMPTY_DRAFT,
  REQUIRED_STEP_IDS,
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

// ── isRequiredStep ───────────────────────────────────────────────────────────

describe("isRequiredStep", () => {
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

// ── EMPTY_DRAFT ──────────────────────────────────────────────────────────────

describe("EMPTY_DRAFT", () => {
  it("seeds exactly the two required steps", () => {
    const ids = EMPTY_DRAFT.steps.map((s) => s.stepId);
    expect(ids).toEqual(["declaration", "submission-confirmation"]);
  });

  it("seeds required steps in canonical order", () => {
    expect(EMPTY_DRAFT.steps[0].stepId).toBe(REQUIRED_STEP_IDS[0]);
    expect(EMPTY_DRAFT.steps[1].stepId).toBe(REQUIRED_STEP_IDS[1]);
  });
});

// ── RESET ────────────────────────────────────────────────────────────────────

describe("RESET", () => {
  it("returns a fresh draft containing only the two required steps", () => {
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

  it("yields independent array references on consecutive resets", () => {
    const state = { ...baseDraft(), steps: [...EMPTY_DRAFT.steps] };
    const first = recipeReducer(state, { type: "RESET" });
    const second = recipeReducer(state, { type: "RESET" });
    expect(first.steps).not.toBe(second.steps);
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
  it("inserts a new step at index 0 when only the two required steps are present", () => {
    // With only declaration + submission-confirmation, there are no step-N ids,
    // so nextStepId returns "step-1".
    const state = { ...baseDraft(), steps: [...EMPTY_DRAFT.steps] };
    const result = recipeReducer(state, { type: "ADD_STEP" });
    expect(result.steps[0].stepId).toBe("step-1");
    // Required steps still present at the tail
    expect(result.steps[1].stepId).toBe("declaration");
    expect(result.steps[2].stepId).toBe("submission-confirmation");
  });

  it("inserts at index 2 (between editable and required) when 2 editable + 2 required steps exist", () => {
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
    expect(result.steps.length).toBe(5);
    expect(result.steps[2].stepId).toBe("step-3");
    expect(result.steps[3].stepId).toBe("declaration");
    expect(result.steps[4].stepId).toBe("submission-confirmation");
  });
});

// ── REORDER_STEPS ────────────────────────────────────────────────────────────

describe("REORDER_STEPS", () => {
  // State: [step-1(0), step-2(1), declaration(2), submission-confirmation(3)]
  const state = {
    ...baseDraft(),
    steps: [
      editableStep("step-1"),
      editableStep("step-2"),
      ...EMPTY_DRAFT.steps,
    ],
  };

  it("refuses a move where toIndex is in the required tail (editable → declaration slot)", () => {
    // Trying to move step-1 to index 2 (declaration's position)
    const result = recipeReducer(state, {
      type: "REORDER_STEPS",
      fromIndex: 0,
      toIndex: 2,
    });
    expect(result).toBe(state);
  });

  it("refuses a move where fromIndex is in the required tail", () => {
    // Trying to move declaration (index 2) to index 0
    const result = recipeReducer(state, {
      type: "REORDER_STEPS",
      fromIndex: 2,
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
    expect(result.steps[2].stepId).toBe("declaration");
    expect(result.steps[3].stepId).toBe("submission-confirmation");
  });
});

// ── LOAD_DRAFT ───────────────────────────────────────────────────────────────

describe("LOAD_DRAFT", () => {
  it("appends both required steps in canonical order when draft lacks them", () => {
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
      "declaration",
      "submission-confirmation",
    ]);
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
    expect(ids).toEqual(["step-1", "declaration", "submission-confirmation"]);
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
        ...EMPTY_DRAFT.steps.slice(1),
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
