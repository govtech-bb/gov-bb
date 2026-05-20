import type {
  RecipeDraft,
  RecipeStepDraft,
  RecipeFieldDraft,
} from "@govtech-bb/form-builder";
import type { Behaviour, FieldOverrides } from "@govtech-bb/form-types";

export type RecipeAction =
  | { type: "ADD_STEP" }
  | { type: "REMOVE_STEP"; stepId: string }
  | {
      type: "UPDATE_STEP_META";
      stepId: string;
      meta: Partial<Pick<RecipeStepDraft, "stepId" | "title" | "description">>;
    }
  | { type: "SET_STEP_BEHAVIOURS"; stepId: string; behaviours: Behaviour[] }
  | { type: "ADD_FIELD"; stepId: string; field: RecipeFieldDraft }
  | { type: "REMOVE_FIELD"; stepId: string; fieldRef: string }
  | {
      type: "UPDATE_FIELD_OVERRIDES";
      stepId: string;
      fieldRef: string;
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
  | { type: "LOAD_DRAFT"; draft: RecipeDraft }
  | { type: "RESET" }
  | {
      type: "SET_FORM_META";
      formId: string;
      title: string;
      description?: string;
    };

export const EMPTY_DRAFT: RecipeDraft = {
  formId: "",
  title: "",
  steps: [],
};

export function recipeReducer(
  state: RecipeDraft,
  action: RecipeAction,
): RecipeDraft {
  switch (action.type) {
    case "ADD_STEP": {
      const n = state.steps.length + 1;
      const newStep: RecipeStepDraft = {
        stepId: `step-${n}`,
        title: `Step ${n}`,
        fields: [],
        behaviours: [],
      };
      return { ...state, steps: [...state.steps, newStep] };
    }

    case "REMOVE_STEP": {
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
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.stepId === action.stepId
            ? { ...s, fields: [...s.fields, action.field] }
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
                fields: s.fields.filter((f) => f.ref !== action.fieldRef),
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
                  f.ref === action.fieldRef
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
      const steps = [...state.steps];
      const tmp = steps[action.fromIndex];
      steps[action.fromIndex] = steps[action.toIndex];
      steps[action.toIndex] = tmp;
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
      return action.draft;
    }

    case "RESET": {
      return { formId: "", title: "", steps: [] };
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

    default:
      return state;
  }
}
