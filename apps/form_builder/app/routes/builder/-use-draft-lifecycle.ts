import type { Dispatch } from "react";
import { serializeRecipeDraft } from "@govtech-bb/form-builder";
import type {
  RecipeDraft,
  RegistryCatalog,
  RecipeValidateResponse,
  UnknownRef,
  ValidationResult,
  ValidationIssue,
} from "@govtech-bb/form-builder";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { validateRecipe } from "../../server/registry";
import { buildLoadArgs, draftsEqual } from "./-apply-recipe";
import { recipeReducer, firstStepId } from "./-recipe-reducer";
import type { RecipeAction } from "./-recipe-reducer";
import type { ApplyRecipeResult } from "./-ai-sidebar";

interface UseDraftLifecycleParams {
  draft: RecipeDraft;
  catalog: RegistryCatalog;
  savedDraft: RecipeDraft | null;
  hasUnsavedChanges: boolean;
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
  catalog,
  savedDraft,
  hasUnsavedChanges,
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

  // Apply a recipe the AI sidebar produced, in place, against the live draft:
  // deserialize → (no-op guard) → collect non-blocking defects → confirm-if-dirty
  // → LOAD_DRAFT → bump patch. Returns a result the sidebar surfaces. The draft
  // is only ever replaced on the changed, confirmed path — an unchanged recipe
  // or a structurally-unreadable one never clobbers good work.
  //
  // Recipe-level defects — unresolvable refs (flagged by convert against the
  // full catalog), id collisions, and server contract-validation failures — are
  // loaded-with-a-warning rather than rejected: the draft loads and the defects
  // are surfaced (contract issues + unresolvable refs in the validation panel;
  // id collisions in the always-on collision panel) so the author can fix the
  // bad fields in place or steer with a follow-up prompt (#1051). Deploy/Save
  // re-run their own hard checks, so an invalid form can never publish (#504).
  //
  // Only two cases stay hard errors (nothing to load): a structurally-unreadable
  // recipe where buildLoadArgs throws, and the validate *request* itself failing
  // (an infrastructure error, not a recipe defect — there's no issue to show).
  const applyAiRecipe = async (
    recipe: ServiceContractRecipe,
    unresolvableRefs: UnknownRef[] = [],
  ): Promise<ApplyRecipeResult> => {
    let incoming: RecipeDraft;
    try {
      incoming = buildLoadArgs(recipe, catalog).draft;
    } catch (e) {
      return {
        applied: false,
        error: e instanceof Error ? e.message : "Could not read the AI recipe.",
      };
    }

    // No-op guard first: a conversational tweak can echo the form back
    // unchanged. Don't validate, don't prompt, don't bump — there's nothing to
    // apply. (Equality ignores version, timestamps, and editor-only ids.)
    if (draftsEqual(draft, incoming)) {
      return { applied: false, reason: "unchanged" };
    }

    // Collect non-blocking defects to surface in the validation panel instead of
    // rejecting. unresolvableRefs (from convert) map to the same issue shape.
    const warnings: ValidationIssue[] = unresolvableRefs.map((r) => ({
      path: r.path,
      message: `Unknown component/block ref "${r.ref}" — fix this field before deploying.`,
    }));

    // Note: id collisions are *not* re-checked or collected here. Loading the
    // draft is enough — the always-on collision panel (hasIdCollisions, computed
    // from the live draft) surfaces them automatically, and Deploy/Save re-run
    // findRecipeIdCollisions as their own hard gate, so a duplicate id can never
    // be published. Collecting them into `warnings` too would render the same
    // collision twice. (Was a hard reject before #1051.)

    // Server validate → warn-and-load on contract failure. Skip when
    // unresolvableRefs are already flagged: the gate would only fail on the very
    // refs we're choosing to tolerate. The request *itself* throwing is an
    // infrastructure error, not a recipe defect, so it stays a hard error.
    if (unresolvableRefs.length === 0) {
      try {
        const serialized = serializeRecipeDraft(incoming);
        const raw = (await validateRecipe({
          data: { recipe: serialized },
        })) as ValidationResult;
        if (!raw.ok) {
          warnings.push(
            ...raw.issues.map((i) => ({
              path: i.path ?? "",
              message: i.message,
            })),
          );
        }
      } catch (e) {
        return {
          applied: false,
          error: e instanceof Error ? e.message : "Validation request failed.",
        };
      }
    }

    // Guard against silently discarding unsaved work already in the editor.
    // Gate on hasUnsavedChanges (not isDirty): replacing a clean, just-loaded
    // form loses nothing (Discard reverts to the saved baseline), so only the
    // presence of unsaved edits warrants a prompt. The message is explicit that
    // the apply only updates the editor and isn't saved.
    if (
      hasUnsavedChanges &&
      !window.confirm(
        "Apply the AI changes to the editor? This replaces the current form and isn't saved — you can Discard to undo, or Save draft to keep it.",
      )
    ) {
      return { applied: false, reason: "cancelled" };
    }

    dispatch({ type: "LOAD_DRAFT", draft: incoming });
    // Mirror handleLoad: open the first step of the freshly applied recipe.
    setSelectedStepId(firstStepId(incoming));
    setMainView("step");
    // Surface any collected defects as non-blocking warnings in the existing
    // validation panel; otherwise clear it.
    if (warnings.length > 0) {
      setValidateResult({ valid: false, issues: warnings });
      setLastSaveStatus("error");
    } else {
      setValidateResult(null);
      setLastSaveStatus("idle");
    }
    setSubmitSuccess(false);
    setSubmitError(null);
    return { applied: true };
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
