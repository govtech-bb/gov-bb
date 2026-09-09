import type { Dispatch } from "react";
import type {
  RecipeDraft,
  RecipeValidateResponse,
  ValidationIssue,
} from "@govtech-bb/form-builder";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { recipeReducer, firstStepId } from "./-recipe-reducer";
import type { RecipeAction } from "./-recipe-reducer";

interface UseDraftLifecycleParams {
  draft: RecipeDraft;
  savedDraft: RecipeDraft | null;
  dispatch: Dispatch<RecipeAction>;
  setSavedDraft: (draft: RecipeDraft | null) => void;
  setLoadedFromId: (id: string | null) => void;
  setSelectedStepId: (id: string | null) => void;
  setMainView: (view: "step" | "processors" | "contactDetails") => void;
  setValidateResult: (result: RecipeValidateResponse | null) => void;
  setLastSaveStatus: (
    status: "idle" | "success" | "error" | "submitted",
  ) => void;
  setSubmitSuccess: (value: boolean) => void;
  setSubmitError: (value: string | null) => void;
  setPreviewData: (value: ServiceContract | null) => void;
  setPreviewRecipeJson: (value: ServiceContractRecipe | null) => void;
  setPreviewError: (value: string | null) => void;
  setIsPickerOpen: (value: boolean) => void;
  setIsSubmitOpen: (value: boolean) => void;
  setIsPreviewOpen: (value: boolean) => void;
}

/**
 * Owns the draft-lifecycle transitions — load / apply-AI-recipe / new / discard
 * / duplicate — and the shared editor reset they perform together: each clears
 * the validation verdict, the submit banner, the preview, and the nav/selection
 * across the clusters those setters come from (validation, save, preview, nav).
 * Highest coupling in the route, so it takes every setter it orchestrates as a
 * param rather than owning that state itself.
 */
export function useDraftLifecycle({
  draft,
  savedDraft,
  dispatch,
  setSavedDraft,
  setLoadedFromId,
  setSelectedStepId,
  setMainView,
  setValidateResult,
  setLastSaveStatus,
  setSubmitSuccess,
  setSubmitError,
  setPreviewData,
  setPreviewRecipeJson,
  setPreviewError,
  setIsPickerOpen,
  setIsSubmitOpen,
  setIsPreviewOpen,
}: UseDraftLifecycleParams) {
  const handleLoad = (loadedDraft: RecipeDraft, formId: string) => {
    const loadAction = { type: "LOAD_DRAFT" as const, draft: loadedDraft };
    dispatch(loadAction);
    // Snapshot the *normalized* draft the reducer produces — LOAD_DRAFT
    // back-fills any missing required steps and reorders them — not the raw
    // input. Snapshotting the raw draft would make a freshly loaded recipe that
    // predates a required step (e.g. check-your-answers) read as already having
    // unsaved changes. LOAD_DRAFT ignores prior state, so `draft` here is just
    // the reducer's required first arg.
    setSavedDraft(recipeReducer(draft, loadAction));
    setLoadedFromId(formId);
    // Open the first step straight away so the author lands in an editable
    // state. firstStepId mirrors LOAD_DRAFT's [...editable, ...required]
    // ordering, so it picks the step the reducer puts first (not loadedDraft[0]).
    setSelectedStepId(firstStepId(loadedDraft));
    setMainView("step");
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setPreviewRecipeJson(null);
    setPreviewError(null);
    setLastSaveStatus("idle");
  };

  const applyAiRecipe = (
    incoming: RecipeDraft,
    warnings: ValidationIssue[],
  ) => {
    dispatch({ type: "LOAD_DRAFT", draft: incoming });
    setSelectedStepId(firstStepId(incoming));
    setMainView("step");
    setValidateResult(
      warnings.length ? { valid: false, issues: warnings } : null,
    );
    setLastSaveStatus(warnings.length ? "error" : "idle");
    setSubmitSuccess(false);
    setSubmitError(null);
  };

  const handleNew = () => {
    dispatch({ type: "RESET" });
    // No saved baseline for a fresh form — unsaved tracking falls back to
    // isDirty until the first save/load.
    setSavedDraft(null);
    setSelectedStepId(null);
    setMainView("step");
    setLoadedFromId(null);
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setPreviewRecipeJson(null);
    setLastSaveStatus("idle");
    // Close all open panels/modals
    setIsPickerOpen(false);
    setIsSubmitOpen(false);
    setIsPreviewOpen(false);
    // Clear transient errors
    setPreviewError(null);
  };

  // Throw away unsaved work. With a saved baseline, revert the editor to it
  // (and its version); with none (brand-new form), clear the form — same as
  // New. Confirm-gated; the toolbar already disables this when there's nothing
  // unsaved.
  const handleDiscard = () => {
    const message =
      savedDraft === null
        ? "Discard unsaved changes and clear the form?"
        : "Discard unsaved changes and revert to the last saved version?";
    if (!window.confirm(message)) return;
    if (savedDraft === null) {
      handleNew();
      return;
    }
    dispatch({ type: "LOAD_DRAFT", draft: savedDraft });
    setSelectedStepId(firstStepId(savedDraft));
    setMainView("step");
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setPreviewRecipeJson(null);
    setPreviewError(null);
    setLastSaveStatus("idle");
  };

  // Load a duplicated recipe (from the picker) as a brand-new unsaved form:
  // no loadedFromId so the next save is a create (formId uniqueness enforced),
  // no savedDraft baseline so it reads as dirty, version reset to 1.0.0. Mirrors
  // handleLoad's editor reset but with new-form identity.
  const handleDuplicate = (dupDraft: RecipeDraft) => {
    dispatch({ type: "LOAD_DRAFT", draft: dupDraft });
    setSavedDraft(null);
    setLoadedFromId(null);
    setSelectedStepId(firstStepId(dupDraft));
    setMainView("step");
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setPreviewRecipeJson(null);
    setPreviewError(null);
    setLastSaveStatus("idle");
  };

  return {
    handleLoad,
    applyAiRecipe,
    handleNew,
    handleDiscard,
    handleDuplicate,
  };
}
