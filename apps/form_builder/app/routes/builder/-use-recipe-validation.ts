import { useState } from "react";
import {
  serializeRecipeDraft,
  findRecipeIdCollisions,
  formatCollisionIssues,
  firstIncompletePaymentProcessor,
} from "@govtech-bb/form-builder";
import type {
  RecipeDraft,
  ValidationResult,
  RecipeValidateResponse,
  ValidationIssue,
  RegistryCatalog,
} from "@govtech-bb/form-builder";
import {
  KEBAB_ID_PATTERN,
  KEBAB_ID_ERROR,
  getRecipeVisibility,
} from "@govtech-bb/form-types";
import { validateRecipe } from "../../server/registry";
import { isRequiredStep } from "./-recipe-reducer";
import type { FormUniquenessResult } from "./-form-uniqueness";

interface UseRecipeValidationParams {
  draft: RecipeDraft;
  catalog: RegistryCatalog;
  uniqueness: FormUniquenessResult;
  rekeyError: string | null;
  /** Focus the Processors panel — the incomplete-payment gate steers the user there. */
  onFocusProcessors: () => void;
}

/**
 * Owns the recipe validation verdict (isValidating / validateResult /
 * lastSaveStatus) and the pre-flight gates BuilderPage runs before a Save
 * draft / Deploy. Exposes `setValidateResult` + `setLastSaveStatus` so the
 * draft-change effect, the save flow, and the draft-lifecycle handlers can
 * reset the verdict they share.
 */
export function useRecipeValidation({
  draft,
  catalog,
  uniqueness,
  rekeyError,
  onFocusProcessors,
}: UseRecipeValidationParams) {
  const [isValidating, setIsValidating] = useState(false);
  const [validateResult, setValidateResult] =
    useState<RecipeValidateResponse | null>(null);
  const [lastSaveStatus, setLastSaveStatus] = useState<
    "idle" | "success" | "error" | "submitted"
  >("idle");

  const editableSteps = draft.steps.filter((s) => !isRequiredStep(s.stepId));
  const hasEditableSteps = editableSteps.length > 0;

  // Runs the full validation flow (pre-flight checks + server validate), sets
  // all the state it always has, AND returns the computed result. Returning it
  // lets the Save draft / Deploy click handlers act on a fresh validation
  // synchronously — React state updates are async, so they can't read
  // validateResult right after triggering it.
  const runValidation = async (): Promise<RecipeValidateResponse> => {
    setIsValidating(true);
    try {
      // Pre-flight checks that the server schema would also fail, but with friendlier messages.
      if (!hasEditableSteps) {
        const result: RecipeValidateResponse = {
          valid: false,
          issues: [
            {
              path: "steps",
              message:
                "Add at least one step before the required Declaration and Submission Confirmation steps.",
            },
          ],
        };
        setValidateResult(result);
        setLastSaveStatus("error");
        return result;
      }
      // A content-only step (intro/information page) carries markdownContent
      // and no fields — that is valid. A step with neither is the empty step.
      const emptyStep = editableSteps.find(
        (s) => s.fields.length === 0 && !s.markdownContent,
      );
      if (emptyStep) {
        const result: RecipeValidateResponse = {
          valid: false,
          issues: [
            {
              path: `steps[${emptyStep.stepId}].fields`,
              message: `Step "${emptyStep.title || emptyStep.stepId}" has no fields.`,
            },
          ],
        };
        setValidateResult(result);
        setLastSaveStatus("error");
        return result;
      }

      // Pre-flight: surface duplicate resolved fieldIds / stepIds in the panel.
      // (The server contract validator can't resolve catalog defaults, so this
      // is the client's job — same pattern as the empty-step pre-flight above.)
      const collisions = findRecipeIdCollisions(draft, catalog);
      if (
        collisions.fieldIdCollisions.length > 0 ||
        collisions.stepIdCollisions.length > 0
      ) {
        const result: RecipeValidateResponse = {
          valid: false,
          issues: formatCollisionIssues(collisions),
        };
        setValidateResult(result);
        setLastSaveStatus("error");
        return result;
      }

      // Pre-flight: Form ID and Title identify the form before deploy. The
      // schema rejects an empty/malformed formId or empty title too, but a
      // friendly message beats Zod's raw "String must contain at least 1
      // character(s)". Reported together so the author fixes both at once.
      const identityIssues: ValidationIssue[] = [];
      if (draft.formId.trim() === "") {
        identityIssues.push({ path: "formId", message: "Form ID is required" });
      } else if (!KEBAB_ID_PATTERN.test(draft.formId)) {
        identityIssues.push({ path: "formId", message: KEBAB_ID_ERROR });
      }
      if (draft.title.trim() === "") {
        identityIssues.push({ path: "title", message: "Title is required" });
      }
      if (identityIssues.length > 0) {
        const result: RecipeValidateResponse = {
          valid: false,
          issues: identityIssues,
        };
        setValidateResult(result);
        setLastSaveStatus("error");
        return result;
      }

      const recipe = serializeRecipeDraft(draft);
      const raw = (await validateRecipe({
        data: { recipe },
      })) as ValidationResult;
      const result: RecipeValidateResponse = {
        valid: raw.ok,
        issues: raw.ok ? [] : raw.issues,
      };
      setValidateResult(result);
      setLastSaveStatus(raw.ok ? "success" : "error");
      return result;
    } catch (e) {
      const result: RecipeValidateResponse = {
        valid: false,
        issues: [
          {
            path: "",
            message:
              e instanceof Error ? e.message : "Validation request failed",
          },
        ],
      };
      setValidateResult(result);
      setLastSaveStatus("error");
      return result;
    } finally {
      setIsValidating(false);
    }
  };

  // Hard gate for both Save draft and Deploy: form-level formId/title
  // collisions can never be saved (unlike contract errors, which Save draft can
  // override). Lights the always-visible validation panel and returns true when
  // blocked. The API re-checks draft collisions on save (it does not yet see
  // published forms — see -form-uniqueness.ts).
  const blockedByUniqueness = (): boolean => {
    const issues = [
      uniqueness.idError && { path: "formId", message: uniqueness.idError },
      rekeyError && { path: "formId", message: rekeyError },
      uniqueness.titleError && {
        path: "title",
        message: uniqueness.titleError,
      },
    ].filter((i): i is { path: string; message: string } => Boolean(i));
    if (issues.length === 0) return false;
    setValidateResult({ valid: false, issues });
    setLastSaveStatus("error");
    return true;
  };

  // Hard gate for both Save draft and Deploy: a payment processor with an
  // incomplete config (e.g. the empty strings makeDefaultProcessor seeds) is
  // sent as the DB `processors` sibling, where the builder API 400s the WHOLE
  // save with an opaque error (#716 follow-up). Pre-flight the same author-time
  // payment schema the API enforces and surface a friendly, targeted message in
  // the always-visible validation panel instead, blocking the save so no request
  // is sent. Lights the panel and returns true when blocked. This is a hard gate
  // even on Save draft (unlike contract errors, which Save draft can override),
  // because an incomplete payment config can never be persisted.
  const blockedByIncompletePayment = (): boolean => {
    const index = firstIncompletePaymentProcessor(draft.processors);
    if (index === null) return false;
    onFocusProcessors();
    setValidateResult({
      valid: false,
      issues: [
        {
          path: "processors",
          message:
            "A payment processor is incomplete. Open the Processors panel and fill in every payment field before saving.",
        },
      ],
    });
    setLastSaveStatus("error");
    return true;
  };

  // Hard gate for Deploy ONLY (#1682 follow-up): a form whose visibility is
  // still `draft` is not ready to publish — only `preview`/`public` recipes may
  // deploy. Lights the validation panel and returns true when blocked. Save
  // draft is intentionally NOT gated: scratch-saving a draft is exactly what
  // draft visibility is for.
  const blockedByDraftVisibility = (): boolean => {
    if (getRecipeVisibility(draft) !== "draft") return false;
    setValidateResult({
      valid: false,
      issues: [
        {
          path: "meta.visibility",
          message:
            "This form's visibility is Draft. Set it to Preview or Public in the toolbar before deploying.",
        },
      ],
    });
    setLastSaveStatus("error");
    return true;
  };

  const dismiss = () => {
    setValidateResult(null);
    setLastSaveStatus("idle");
  };

  return {
    isValidating,
    validateResult,
    lastSaveStatus,
    setValidateResult,
    setLastSaveStatus,
    runValidation,
    blockedByUniqueness,
    blockedByIncompletePayment,
    blockedByDraftVisibility,
    dismiss,
  };
}
