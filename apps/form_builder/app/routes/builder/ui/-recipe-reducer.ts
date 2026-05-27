import type {
  RecipeDraft,
  RecipeStepDraft,
  RecipeFieldDraft,
  RecipeProcessorDraft,
  AuthorableProcessorType,
} from "@govtech-bb/form-builder";
import { makeDefaultProcessor } from "@govtech-bb/form-builder";
import type { Behaviour, FieldOverrides } from "@govtech-bb/form-types";

export const REQUIRED_STEP_IDS = [
  "declaration",
  "submission-confirmation",
] as const;
export type RequiredStepId = (typeof REQUIRED_STEP_IDS)[number];

export function isRequiredStep(stepId: string): stepId is RequiredStepId {
  return (REQUIRED_STEP_IDS as readonly string[]).includes(stepId);
}

function makeRequiredSteps(): RecipeStepDraft[] {
  return [
    {
      stepId: "declaration",
      title: "Declaration",
      description: undefined,
      fields: [],
      behaviours: [],
    },
    {
      stepId: "submission-confirmation",
      title: "Submission Confirmation",
      description: undefined,
      fields: [],
      behaviours: [],
    },
  ];
}

export type RecipeAction =
  | { type: "ADD_STEP" }
  | { type: "REMOVE_STEP"; stepId: string }
  | {
      type: "UPDATE_STEP_META";
      stepId: string;
      meta: Partial<Pick<RecipeStepDraft, "stepId" | "title" | "description">>;
    }
  | { type: "SET_STEP_BEHAVIOURS"; stepId: string; behaviours: Behaviour[] }
  | {
      type: "ADD_FIELD";
      stepId: string;
      // Callers pass a draft without `id`; the reducer mints one. Keeps
      // FieldPicker call sites simple and ensures every step-resident field
      // has a unique editor id.
      field: Omit<RecipeFieldDraft, "id">;
    }
  | { type: "REMOVE_FIELD"; stepId: string; fieldId: string }
  | {
      type: "UPDATE_FIELD_OVERRIDES";
      stepId: string;
      fieldId: string;
      overrides: FieldOverrides;
      childOverrides?: Record<string, FieldOverrides>;
    }
  | { type: "REORDER_STEPS"; fromIndex: number; toIndex: number }
  | {
      type: "REORDER_FIELDS";
      stepId: string;
      fromIndex: number;
      toIndex: number;
    }
  | { type: "ADD_PROCESSOR"; processorType: AuthorableProcessorType }
  | { type: "REMOVE_PROCESSOR"; id: string }
  | {
      type: "UPDATE_PROCESSOR_CONFIG";
      id: string;
      // The full replacement config. Typed loosely because the action can't know
      // the matched processor's variant; the config form supplies a
      // correctly-shaped config and the server Validate flow enforces the schema.
      // Replace (not merge) so key-value editors can remove keys; the form is
      // responsible for spreading existing config to keep unrendered keys (e.g.
      // webhook `secret`).
      config: Record<string, unknown>;
    }
  | { type: "LOAD_DRAFT"; draft: RecipeDraft }
  | { type: "RESET" }
  | {
      type: "SET_FORM_META";
      formId: string;
      title: string;
      description?: string;
    };

// Shared module-level constant; treat as immutable. RESET / new-form flows
// call makeRequiredSteps() afresh, so don't mutate this object's arrays in place.
export const EMPTY_DRAFT: RecipeDraft = {
  formId: "",
  title: "",
  steps: makeRequiredSteps(),
};

export function nextStepId(steps: RecipeStepDraft[]): string {
  const existingNums = steps
    .map((s) => {
      const m = s.stepId.match(/^step-(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const n = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  return `step-${n}`;
}

export function recipeReducer(
  state: RecipeDraft,
  action: RecipeAction,
): RecipeDraft {
  switch (action.type) {
    case "ADD_STEP": {
      const stepId = nextStepId(state.steps);
      const n = parseInt(stepId.replace("step-", ""), 10);
      const newStep: RecipeStepDraft = {
        stepId,
        title: `Step ${n}`,
        description: undefined,
        fields: [],
        behaviours: [],
      };
      const requiredCount = REQUIRED_STEP_IDS.length;
      const insertAt = Math.max(0, state.steps.length - requiredCount);
      const before = state.steps.slice(0, insertAt);
      const after = state.steps.slice(insertAt);
      return { ...state, steps: [...before, newStep, ...after] };
    }

    case "REMOVE_STEP": {
      if (isRequiredStep(action.stepId)) return state; // ignore
      return {
        ...state,
        steps: state.steps.filter((s) => s.stepId !== action.stepId),
      };
    }

    case "UPDATE_STEP_META": {
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.stepId === action.stepId ? { ...s, ...action.meta } : s,
        ),
      };
    }

    case "SET_STEP_BEHAVIOURS": {
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.stepId === action.stepId
            ? { ...s, behaviours: action.behaviours }
            : s,
        ),
      };
    }

    case "ADD_FIELD": {
      // Mint id here so callers can pass plain drafts.
      const fieldWithId: RecipeFieldDraft = {
        ...action.field,
        id: crypto.randomUUID(),
      };
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.stepId === action.stepId
            ? { ...s, fields: [...s.fields, fieldWithId] }
            : s,
        ),
      };
    }

    case "REMOVE_FIELD": {
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.stepId === action.stepId
            ? {
                ...s,
                fields: s.fields.filter((f) => f.id !== action.fieldId),
              }
            : s,
        ),
      };
    }

    case "UPDATE_FIELD_OVERRIDES": {
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.stepId === action.stepId
            ? {
                ...s,
                fields: s.fields.map((f) =>
                  f.id === action.fieldId
                    ? {
                        ...f,
                        overrides: action.overrides,
                        ...(action.childOverrides !== undefined
                          ? { childOverrides: action.childOverrides }
                          : {}),
                      }
                    : f,
                ),
              }
            : s,
        ),
      };
    }

    case "REORDER_STEPS": {
      const requiredCount = REQUIRED_STEP_IDS.length;
      const lastEditableIndex = state.steps.length - requiredCount - 1;
      const { fromIndex, toIndex } = action;
      // Refuse to move into or out of the required tail.
      if (fromIndex > lastEditableIndex || toIndex > lastEditableIndex)
        return state;
      const steps = [...state.steps];
      const tmp = steps[fromIndex];
      steps[fromIndex] = steps[toIndex];
      steps[toIndex] = tmp;
      return { ...state, steps };
    }

    case "REORDER_FIELDS": {
      return {
        ...state,
        steps: state.steps.map((s) => {
          if (s.stepId !== action.stepId) return s;
          const fields = [...s.fields];
          const tmp = fields[action.fromIndex];
          fields[action.fromIndex] = fields[action.toIndex];
          fields[action.toIndex] = tmp;
          return { ...s, fields };
        }),
      };
    }

    case "LOAD_DRAFT": {
      const incoming = action.draft.steps;
      const byId = new Map(incoming.map((s) => [s.stepId, s]));
      const editable = incoming.filter((s) => !isRequiredStep(s.stepId));
      const required = REQUIRED_STEP_IDS.map((id) => {
        const existing = byId.get(id);
        return (
          existing ?? {
            stepId: id,
            title:
              id === "declaration" ? "Declaration" : "Submission Confirmation",
            description: undefined,
            fields: [],
            behaviours: [],
          }
        );
      });
      return { ...action.draft, steps: [...editable, ...required] };
    }

    case "RESET": {
      return { formId: "", title: "", steps: makeRequiredSteps() };
    }

    case "SET_FORM_META": {
      return {
        ...state,
        formId: action.formId,
        title: action.title,
        ...(action.description !== undefined
          ? { description: action.description }
          : {}),
      };
    }

    case "ADD_PROCESSOR": {
      // Spreading the union value from makeDefaultProcessor and adding the id
      // distributes over the discriminated union, so the result stays a valid
      // RecipeProcessorDraft with its type↔config correlation intact.
      const newProcessor: RecipeProcessorDraft = {
        ...makeDefaultProcessor(action.processorType),
        id: crypto.randomUUID(),
      };
      return {
        ...state,
        processors: [...(state.processors ?? []), newProcessor],
      };
    }

    case "REMOVE_PROCESSOR": {
      // No-op (and don't introduce an empty array) when none exist, so the
      // absent-vs-empty distinction the serializer relies on is preserved.
      if (!state.processors) return state;
      return {
        ...state,
        processors: state.processors.filter((p) => p.id !== action.id),
      };
    }

    case "UPDATE_PROCESSOR_CONFIG": {
      if (!state.processors) return state;
      return {
        ...state,
        processors: state.processors.map((p) =>
          p.id === action.id
            ? // Replace the config wholesale so key-value editors can remove
              // keys. The form spreads the existing config first, which is what
              // keeps unrendered keys (e.g. webhook `secret`) alive. The cast is
              // needed because the new config can't be statically tied to p's
              // variant.
              ({ ...p, config: action.config } as RecipeProcessorDraft)
            : p,
        ),
      };
    }

    default:
      return state;
  }
}
