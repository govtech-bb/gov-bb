import type {
  RecipeDraft,
  RecipeStepDraft,
  RecipeFieldDraft,
  RecipeProcessorDraft,
  AuthorableProcessorType,
} from "@govtech-bb/form-builder";
import { makeDefaultProcessor } from "@govtech-bb/form-builder";
import type {
  Behaviour,
  ContactDetails,
  FieldOverrides,
} from "@govtech-bb/form-types";

// Listed in display order. `check-your-answers` is first so the pinned tail
// renders as [check-your-answers, declaration, submission-confirmation] — i.e.
// the review step sits right before the declaration.
export const REQUIRED_STEP_IDS = [
  "check-your-answers",
  "declaration",
  "submission-confirmation",
] as const;
export type RequiredStepId = (typeof REQUIRED_STEP_IDS)[number];

export function isRequiredStep(stepId: string): stepId is RequiredStepId {
  return (REQUIRED_STEP_IDS as readonly string[]).includes(stepId);
}

// The step a freshly-loaded form should open in the editor. Mirrors the
// LOAD_DRAFT normalization ([...editable, ...required]) so it stays correct
// against the *pre*-normalization draft the load handlers receive: prefer the
// first editable (non-required) step, fall back to the first step overall, then
// null when there are no steps at all.
export function firstStepId(draft: RecipeDraft): string | null {
  const editable = draft.steps.filter((s) => !isRequiredStep(s.stepId));
  return (editable[0] ?? draft.steps[0])?.stepId ?? null;
}

// Required steps that accept no author-added fields. `check-your-answers` is a
// pure review screen and `submission-confirmation` renders only its nextSteps
// copy — neither should expose the FieldPicker. `declaration` is intentionally
// absent: it bears the confirmation checkbox and stays field-editable.
export const NO_FIELDS_STEP_IDS = [
  "check-your-answers",
  "submission-confirmation",
] as const;

export function isNoFieldsStep(stepId: string): boolean {
  return (NO_FIELDS_STEP_IDS as readonly string[]).includes(stepId);
}

// Default title/description seeded for each required step when one is missing
// (new form via makeRequiredSteps, or an older recipe loaded via LOAD_DRAFT).
// check-your-answers reuses the runtime review copy from apps/forms.
const REQUIRED_STEP_DEFAULTS: Record<
  RequiredStepId,
  { title: string; description?: string }
> = {
  "check-your-answers": {
    title: "Check your answers",
    description:
      "Review all the information you have provided before submitting your application.",
  },
  declaration: { title: "Declaration" },
  "submission-confirmation": { title: "Submission Confirmation" },
};

function makeRequiredSteps(): RecipeStepDraft[] {
  return REQUIRED_STEP_IDS.map((stepId) => ({
    stepId,
    title: REQUIRED_STEP_DEFAULTS[stepId].title,
    description: REQUIRED_STEP_DEFAULTS[stepId].description,
    fields: [],
    behaviours: [],
  }));
}

/**
 * The single email processor every new form seeds with (issue #572).
 *
 * - **MDA Email** — `recipientField` is the reserved `contactDetails.email`,
 *   resolved at runtime from the form's contact details. A non-empty recipient,
 *   so a brand-new form is valid out of the box.
 *
 * We deliberately do *not* seed an applicant-email processor: a fieldless new
 * form has no email field to point at and no canonical applicant-email path, so
 * a seeded one would ship with a blank `recipientField` and fail author-time
 * Validate before the author does anything wrong (issue #572). Authors add an
 * applicant-email processor on demand via **+ Add Processor** once a suitable
 * field exists — that one starts blank and is *correctly* flagged until
 * configured.
 *
 * Fresh `crypto.randomUUID()` ids per call so RESET / new-form flows re-seed
 * with distinct editor ids, mirroring makeRequiredSteps().
 */
function makeDefaultProcessors(): RecipeProcessorDraft[] {
  return [
    {
      id: crypto.randomUUID(),
      type: "email",
      config: {
        recipientField: "contactDetails.email",
        label: "MDA Email",
        subject: "New form submission received",
      },
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
      // Change a field's registry ref (its type) in place, replacing its
      // overrides with the migrated set the editor computed via
      // migrateOverridesForRef. Keeps the field's id and position (#642).
      type: "CHANGE_FIELD_REF";
      stepId: string;
      fieldId: string;
      ref: string;
      overrides: FieldOverrides;
    }
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
  | {
      // Set the whole contact-details object, or clear it (undefined collapses
      // back to absent, mirroring how REMOVE_PROCESSOR drops the last entry).
      type: "UPDATE_CONTACT_DETAILS";
      contactDetails: ContactDetails | undefined;
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
// call makeRequiredSteps() and makeDefaultProcessors() afresh, so don't mutate
// this object's arrays in place.
export const EMPTY_DRAFT: RecipeDraft = {
  formId: "",
  title: "",
  steps: makeRequiredSteps(),
  processors: makeDefaultProcessors(),
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

    case "CHANGE_FIELD_REF": {
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.stepId === action.stepId
            ? {
                ...s,
                fields: s.fields.map((f) =>
                  f.id === action.fieldId
                    ? // Swaps only ever target a generic primitive, so the
                      // field's kind is always a plain component afterwards —
                      // normalize it so a former custom/block kind can't linger
                      // and disagree with the new ref.
                      {
                        ...f,
                        kind: "component",
                        ref: action.ref,
                        overrides: action.overrides,
                      }
                    : f,
                ),
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
          // Move (remove + insert) rather than swap, so drag-and-drop across
          // several positions lands correctly. Adjacent moves (the ▲/▼ arrow
          // buttons) are the single-step case and behave identically.
          const fields = [...s.fields];
          const [moved] = fields.splice(action.fromIndex, 1);
          fields.splice(action.toIndex, 0, moved);
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
            title: REQUIRED_STEP_DEFAULTS[id].title,
            description: REQUIRED_STEP_DEFAULTS[id].description,
            fields: [],
            behaviours: [],
          }
        );
      });
      return { ...action.draft, steps: [...editable, ...required] };
    }

    case "RESET": {
      return {
        formId: "",
        title: "",
        steps: makeRequiredSteps(),
        processors: makeDefaultProcessors(),
      };
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

    case "UPDATE_CONTACT_DETAILS": {
      // Collapse "cleared" back to an absent key so the serializer's
      // `!== undefined` guard keeps absent distinct from a set object.
      if (action.contactDetails === undefined) {
        const { contactDetails: _dropped, ...rest } = state;
        return rest;
      }
      return { ...state, contactDetails: action.contactDetails };
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
      const remaining = state.processors.filter((p) => p.id !== action.id);
      // Collapse the empty case back to undefined for the same reason — removing
      // the last processor must not leave a `[]` behind.
      return {
        ...state,
        processors: remaining.length > 0 ? remaining : undefined,
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
