import "../../styles/builder.global.css";
import { createFileRoute } from "@tanstack/react-router";
import { useReducer, useState, useMemo, useEffect } from "react";
import { getCatalogFn } from "../../server/registry";
import { deleteForm, disableForm, enableForm } from "../../server/forms";
import { createMdaContact } from "../../server/mda-contacts";
import { getPublishBaseBranch, eraseRecipe } from "../../server/publish";
import { validateRecipe, previewRecipe } from "../../server/registry";
import { serializeRecipeDraft, findRecipeIdCollisions, resolveFieldIds } from "@govtech-bb/form-builder";
import type {
  ServiceContract,
  ServiceContractRecipe,
  RecipeVisibility,
} from "@govtech-bb/form-types";
import {
  getRecipeVisibility,
} from "@govtech-bb/form-types";
import type { RecipeDraft, ValidationResult, ValidationIssue, UnknownRef } from "@govtech-bb/form-builder";

import { Layers01Icon, Moon02Icon, Sun03Icon } from "hugeicons-react";

/** Collapse repeated identical locations ("Declaration › Name; Declaration ›
 *  Name; …") into one entry with a count ("Declaration › Name ×4"). */
function formatCollisionLocations(items: string[]): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts]
    .map(([text, n]) => (n > 1 ? `${text} ×${n}` : text))
    .join(", ");
}
import { SectionSwitch } from "../../components/section-switch";
import { Tip } from "../content/-sliding-tabs";
import { useTheme } from "../content/-use-theme";
import { buildLoadArgs, draftsEqual } from "./-apply-recipe";
import { AiSidebar, type ApplyRecipeResult } from "./-ai-sidebar";
import { recipeReducer, EMPTY_DRAFT, nextStepId, REQUIRED_STEP_IDS, firstStepId } from "./-recipe-reducer";
import { Toolbar } from "./-toolbar";
import { usePresence } from "./-use-presence";
import { PresenceBanner } from "./-presence-banner";
import { StepList } from "./-step-list";
import { StepEditor } from "./-step-editor";
import { ProcessorsEditor } from "./-processors-editor";
import { ContactDetailsEditor } from "./-contact-details-editor";
import { ValidationPanel } from "./-validation-panel";
import { PreviewModal } from "./-preview-modal";
import { formPreviewUrl } from "../../lib/form-url";
import { SubmitModal } from "./-submit-modal";
import { PublishModal } from "./-publish-modal";
import { FormPicker } from "./-form-picker";
import { checkFormUniqueness, checkRekeyPublished } from "./-form-uniqueness";
import { useFormsList } from "./-use-forms-list";
import { useMdaContacts } from "./-use-mda-contacts";
import { useRecipeValidation } from "./-use-recipe-validation";
import { useRecipeSave } from "./-use-recipe-save";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";
import { DeleteModal } from "./-delete-modal";
import { DisableModal } from "./-disable-modal";
import { EraseModal } from "./-erase-modal";
import type { BuilderFormSummary } from "../../types/index";

import styles from "../../styles/builder.module.css";

export const Route = createFileRoute("/builder/")({
  // The catalog is needed for the first render (StepEditor, the duplicate-ID
  // memo) and is cheap thanks to its 60s server cache. The base branch is a
  // tiny env-var read resolved server-side (it can't be read from the client
  // bundle), so it rides along here. The forms list is a slow, uncached
  // GitHub-API waterfall consumed only by the Open picker, so it stays off the
  // critical path via useFormsList.
  loader: async () => {
    const [catalog, baseBranch] = await Promise.all([
      getCatalogFn(),
      getPublishBaseBranch(),
    ]);
    return { catalog, baseBranch };
  },
  component: BuilderPage,
});

function BuilderPage() {
  const { catalog, baseBranch } = Route.useLoaderData();
  const {
    forms,
    loadError: formsLoadError,
    refetch: refetchForms,
    upsertForm,
  } = useFormsList();
  // Per-environment MDA contact directory (issue #607), consumed by the
  // contact-details dropdown.
  const {
    contacts: mdaContacts,
    loadError: mdaContactsLoadError,
    upsertContact: upsertMdaContact,
  } = useMdaContacts();
  // Shares the content CMS's persisted light/dark choice, so the theme
  // follows the user across the section switch.
  const { theme, toggleTheme } = useTheme();
  const [draft, dispatch] = useReducer(recipeReducer, EMPTY_DRAFT);
  // Snapshot of the last saved/loaded draft — the baseline that "unsaved
  // changes" is measured against. null for a brand-new form (no save/load yet);
  // set on load, on save-success, and back to null on New.
  const [savedDraft, setSavedDraft] = useState<RecipeDraft | null>(null);

  // UI state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  // Which view the main area shows. Processors and contact details are
  // form-scoped, so they each get a sibling view to the per-step editor rather
  // than living inside a step.
  const [mainView, setMainView] = useState<
    "step" | "processors" | "contactDetails"
  >("step");
  const [loadedFromId, setLoadedFromId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<ServiceContract | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // The serialized draft captured when Preview is pressed (#744) — set before
  // the preview request so the "View recipe JSON" action works even while the
  // contract is loading or the request failed.
  const [previewRecipeJson, setPreviewRecipeJson] = useState<ServiceContractRecipe | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BuilderFormSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<BuilderFormSummary | null>(null);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [eraseTarget, setEraseTarget] = useState<BuilderFormSummary | null>(null);
  const [isErasing, setIsErasing] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [eraseSuccess, setEraseSuccess] = useState<
    { prUrl: string; prNumber: number } | null
  >(null);

  // Derived
  const selectedStep = draft.steps.find((s) => s.stepId === selectedStepId) ?? null;
  const isDirty =
    draft.steps.length > REQUIRED_STEP_IDS.length ||
    draft.formId !== "" ||
    draft.title !== "";
  // The honest "has unsaved work" flag: compare the live draft against the
  // saved baseline. Before any save/load there's no baseline, so a brand-new
  // form falls back to isDirty ("is the form non-empty"). draftsEqual ignores
  // version/timestamps/editor-only ids, so it goes clean right after a save.
  // `comparePayments` so a payment-processor edit (stripped from the recipe,
  // #958) still flags as unsaved — both sides here retain payment config.
  const hasUnsavedChanges =
    savedDraft === null
      ? isDirty
      : !draftsEqual(draft, savedDraft, { comparePayments: true });

  // Any draft edit invalidates the last validate/save verdict in the header —
  // otherwise "✓ Valid" sits beside "● Unsaved changes" and lies. Validation
  // and saving never mutate `draft`, so the verdict survives until a real
  // edit. (Same-value setState bails out, so per-keystroke runs are free.)
  useEffect(() => {
    setLastSaveStatus("idle");
  }, [draft]);

  // Cheap insurance against losing an unsaved draft to a closed/refreshed
  // tab. The in-app section switch has its own confirm guard.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);
  // Live recipe-wide uniqueness check over resolved field ids + step ids. Drives
  // the red duplicate-ID banner below the body; the collision pre-flight inside
  // runValidation re-checks it on every Save draft / Deploy click.
  const idCollisions = useMemo(
    () => findRecipeIdCollisions(draft, catalog),
    [draft, catalog],
  );
  const hasIdCollisions =
    idCollisions.fieldIdCollisions.length > 0 ||
    idCollisions.stepIdCollisions.length > 0;

  // Resolved field paths (stepId.fieldId, blocks expanded) for the processor
  // config path-pickers. Same memo shape as idCollisions above.
  const resolvedFieldIds = useMemo(
    () => resolveFieldIds(draft, catalog),
    [draft, catalog],
  );

  // Form-level uniqueness mirror of the API checks (#545): a new form's formId
  // and the title must not collide with another form. Drives the live formId
  // error in the toolbar and hard-gates Save draft / Deploy below. `forms` is
  // null until useFormsList resolves; treat that as "nothing to collide with"
  // and let the API re-check on save.
  const uniqueness = useMemo(
    () => checkFormUniqueness(forms ?? [], draft, loadedFromId),
    [forms, draft, loadedFromId],
  );

  // Re-key published guard (#674): a published form's ID can't be changed.
  // Mirror the API's 409 so the user is pre-blocked at save time rather than
  // only seeing the failure after the round-trip.
  const rekeyError = useMemo(
    () => checkRekeyPublished(forms ?? [], draft, loadedFromId),
    [forms, draft, loadedFromId],
  );

  // Editing presence / read-only lock (#874). Claim the open form's single
  // editing session, keyed on the loaded form's id. A brand-new, unsaved form
  // has no concurrent editor (and the API exempts brand-new creation), so we
  // pass null until the form has been loaded/saved. When another user holds the
  // fresh claim, `isReadOnly` disables the edit affordances, Save and Deploy,
  // and the banner names the current editor.
  const { isReadOnly, holder: presenceHolder } = usePresence(loadedFromId);

  // Recipe validation verdict + pre-flight gates (isValidating / validateResult
  // / lastSaveStatus). Setters are exposed so the draft-change effect above, the
  // save flow, and the lifecycle handlers can reset the verdict they share.
  const {
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
  } = useRecipeValidation({
    draft,
    catalog,
    uniqueness,
    rekeyError,
    onFocusProcessors: () => setMainView("processors"),
  });

  // Save draft + deploy flow (submit/publish state, modal, and handlers).
  // setSubmitSuccess / setSubmitError are exposed so the Save-draft click and
  // the lifecycle handlers can reset the submit banner they share.
  const {
    isSubmitting,
    submitSuccess,
    submitError,
    isPublishOpen,
    isPublishing,
    publishSuccess,
    publishError,
    setSubmitSuccess,
    setSubmitError,
    handleSubmit,
    handleOpenPublish,
    handlePublish,
    handleClosePublish,
  } = useRecipeSave({
    draft,
    loadedFromId,
    forms,
    hasUnsavedChanges,
    setSavedDraft,
    setLoadedFromId,
    setLastSaveStatus,
    upsertForm,
    refetchForms,
  });

  // Handlers
  // Save draft / Deploy validate the current draft on click, then open their
  // modal only if it's valid. One click, not two — and because every click
  // re-validates the live draft, a stale validateResult can never green-light a
  // bad save.
  //
  // Save draft is the exception: an invalid draft can still be saved once the
  // user confirms, so an in-progress form can be shared for review. The errors
  // stay lit in the validation panel either way; the SubmitModal still collects
  // (and semver-validates) the version. Deploy stays hard-gated on validity.
  const handleSaveDraftClick = async () => {
    if (blockedByUniqueness()) return;
    if (blockedByIncompletePayment()) return;
    const result = await runValidation();
    if (
      !result.valid &&
      !window.confirm(
        "This form has validation errors. Save it as a draft anyway so others can review it?",
      )
    ) {
      return;
    }
    setSubmitSuccess(false);
    setSubmitError(null);
    setIsSubmitOpen(true);
  };

  const handleDeployClick = async () => {
    if (blockedByDraftVisibility()) return;
    if (blockedByUniqueness()) return;
    if (blockedByIncompletePayment()) return;
    const result = await runValidation();
    if (result.valid) handleOpenPublish();
  };

  const handlePreview = async () => {
    setIsPreviewOpen(true);
    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const recipe = serializeRecipeDraft(draft);
      // Captured before the request so the JSON is inspectable even when the
      // preview request fails — failure is exactly when you want to see it.
      setPreviewRecipeJson(recipe);
      const contract = await previewRecipe({ data: { recipe } }) as ServiceContract;
      setPreviewData(contract as ServiceContract);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview request failed");
    } finally {
      setIsPreviewing(false);
    }
  };

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
            ...raw.issues.map((i) => ({ path: i.path ?? "", message: i.message })),
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

  const handleRequestDelete = (form: BuilderFormSummary) => {
    setDeleteError(null);
    setDeleteTarget(form);
    setIsPickerOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteForm({ data: { formId: deleteTarget.formId } });
      // If the deleted draft is the one open in the editor, clear it.
      if (loadedFromId === deleteTarget.formId) handleNew();
      setDeleteTarget(null);
      // The forms list lives in useFormsList (no longer route-loader data), so
      // refetch it directly to drop the deleted entry from the Open picker.
      refetchForms();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseDelete = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleRequestDisable = (form: BuilderFormSummary) => {
    setDisableError(null);
    setDisableTarget(form);
    setIsPickerOpen(false);
  };

  const handleConfirmDisable = async (reason: string) => {
    if (!disableTarget) return;
    setIsDisabling(true);
    setDisableError(null);
    try {
      await disableForm({ data: { formId: disableTarget.formId, reason } });
      setDisableTarget(null);
      // Refetch so the row flips to the Disabled badge + Enable button.
      refetchForms();
    } catch (e) {
      setDisableError(e instanceof Error ? e.message : "Disable failed");
    } finally {
      setIsDisabling(false);
    }
  };

  const handleCloseDisable = () => {
    if (isDisabling) return;
    setDisableTarget(null);
    setDisableError(null);
  };

  const handleRequestErase = (form: BuilderFormSummary) => {
    setEraseError(null);
    setEraseSuccess(null);
    setEraseTarget(form);
    setIsPickerOpen(false);
  };

  const handleConfirmErase = async (reason: string) => {
    if (!eraseTarget) return;
    setIsErasing(true);
    setEraseError(null);
    try {
      const result = await eraseRecipe({
        data: {
          formId: eraseTarget.formId,
          title: eraseTarget.title,
          reason,
        },
      });
      // The recipe stays on disk until the PR merges, so the picker row is left
      // as-is — we surface the PR link in the modal instead of refetching.
      setEraseSuccess(result);
    } catch (e) {
      setEraseError(e instanceof Error ? e.message : "Erase failed");
    } finally {
      setIsErasing(false);
    }
  };

  const handleCloseErase = () => {
    if (isErasing) return;
    setEraseTarget(null);
    setEraseError(null);
    setEraseSuccess(null);
  };

  // Enable is a direct action (no modal) with an inline confirm: clearing a
  // tombstone restores the public service, so a single confirm is enough.
  const handleEnable = async (form: BuilderFormSummary) => {
    if (
      !window.confirm(
        `Re-enable ${form.title || form.formId}? The public service will be restored.`,
      )
    ) {
      return;
    }
    try {
      await enableForm({ data: { formId: form.formId } });
      refetchForms();
    } catch (e) {
      // Surface in the picker's load-error slot via the forms list is overkill;
      // a window.alert keeps the inline action simple and visible.
      window.alert(e instanceof Error ? e.message : "Enable failed");
    }
  };

  const handleFormIdChange = (id: string) => {
    dispatch({ type: "SET_FORM_META", formId: id, title: draft.title, description: draft.description });
  };

  const handleTitleChange = (title: string) => {
    dispatch({ type: "SET_FORM_META", formId: draft.formId, title, description: draft.description });
  };

  const handleVisibilityChange = (visibility: RecipeVisibility) => {
    dispatch({ type: "SET_VISIBILITY", visibility });
  };

  // Create an MDA contact via the API, patch it into the local directory so the
  // dropdown shows it immediately, and hand the created row back to the editor
  // (which selects it). Issue #607.
  const handleCreateMdaContact = async (
    input: CreateMdaContactInput,
  ): Promise<MdaContact> => {
    const created = await createMdaContact({ data: input });
    upsertMdaContact(created);
    return created;
  };

  const handleSelectStep = (stepId: string) => {
    setSelectedStepId(stepId);
    setMainView("step");
  };

  const handleSelectProcessors = () => {
    setMainView("processors");
  };

  const handleSelectContactDetails = () => {
    setMainView("contactDetails");
  };

  const handleAddStep = () => {
    const stepId = nextStepId(draft.steps);
    dispatch({ type: "ADD_STEP" });
    setSelectedStepId(stepId);
    setMainView("step");
  };

  const handleRemoveStep = (stepId: string) => {
    dispatch({ type: "REMOVE_STEP", stepId });
    if (selectedStepId === stepId) setSelectedStepId(null);
  };

  const handleMoveStepUp = (index: number) => {
    dispatch({ type: "REORDER_STEPS", fromIndex: index, toIndex: index - 1 });
  };

  const handleMoveStepDown = (index: number) => {
    dispatch({ type: "REORDER_STEPS", fromIndex: index, toIndex: index + 1 });
  };

  const handleStepIdChange = (_oldId: string, newId: string) => {
    setSelectedStepId(newId);
  };

  return (
    <div className={styles.builderShell}>
      {isReadOnly && presenceHolder && (
        <PresenceBanner holder={presenceHolder} />
      )}
      {/* The header spans the full app width, above both the editor and the
          AI sidebar, so toggling the sidebar never reflows it. */}
      <Toolbar
        leading={
          <>
            <SectionSwitch
              current="builder"
              onBeforeNavigate={() =>
                !hasUnsavedChanges ||
                window.confirm("Unsaved changes will be lost. Continue?")
              }
            />
            <Tip
              label={theme === "light" ? "Dark mode" : "Light mode"}
              placement="bottom"
            >
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={theme === "light" ? "Dark mode" : "Light mode"}
                onClick={toggleTheme}
              >
                {theme === "light" ? (
                  <Moon02Icon size={15} />
                ) : (
                  <Sun03Icon size={15} />
                )}
              </button>
            </Tip>
          </>
        }
        formId={draft.formId}
        title={draft.title}
        idError={uniqueness.idError}
        isDirty={isDirty}
        hasUnsavedChanges={hasUnsavedChanges}
        isValidating={isValidating}
        isPreviewing={isPreviewing}
        isSubmitting={isSubmitting}
        isPublishing={isPublishing}
        isReadOnly={isReadOnly}
        lastSaveStatus={lastSaveStatus}
        visibility={getRecipeVisibility(draft)}
        onVisibilityChange={handleVisibilityChange}
        onFormIdChange={handleFormIdChange}
        onTitleChange={handleTitleChange}
        onNew={handleNew}
        onOpen={() => setIsPickerOpen(true)}
        onValidate={runValidation}
        onPreview={handlePreview}
        onSubmit={handleSaveDraftClick}
        onPublish={handleDeployClick}
        onDiscard={handleDiscard}
      />

      <div className={styles.builderMain}>
      <div className={styles.builderRoot}>
      <div className={styles.builderBody}>
        <StepList
          steps={draft.steps}
          selectedStepId={mainView === "step" ? selectedStepId : null}
          onSelect={handleSelectStep}
          onAdd={handleAddStep}
          onRemove={handleRemoveStep}
          onMoveUp={handleMoveStepUp}
          onMoveDown={handleMoveStepDown}
          processorCount={draft.processors?.length ?? 0}
          isProcessorsActive={mainView === "processors"}
          onSelectProcessors={handleSelectProcessors}
          hasContactDetails={draft.contactDetails !== undefined}
          isContactDetailsActive={mainView === "contactDetails"}
          onSelectContactDetails={handleSelectContactDetails}
        />

        {mainView === "contactDetails" ? (
          <ContactDetailsEditor
            draft={draft}
            dispatch={dispatch}
            contacts={mdaContacts}
            contactsLoadError={mdaContactsLoadError}
            onCreateContact={handleCreateMdaContact}
          />
        ) : mainView === "processors" ? (
          <ProcessorsEditor
            draft={draft}
            dispatch={dispatch}
            fields={resolvedFieldIds}
          />
        ) : selectedStep !== null ? (
          <StepEditor
            step={selectedStep}
            draft={draft}
            dispatch={dispatch}
            catalog={catalog}
            onStepIdChange={handleStepIdChange}
          />
        ) : (
          <div className={styles.noStepSelected}>
            <div className={styles.emptyState}>
              <Layers01Icon size={28} />
              <p>Select or add a step to begin</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating over the canvas (not in-flow) so appearing/dismissing never
          reflows the editor underneath. */}
      <div className={styles.bannerStack}>
      {hasIdCollisions && (
        <div className={styles.errorBanner} role="alert">
          <strong>Duplicate IDs must be fixed before saving or deploying</strong>
          <ul className={styles.bannerList}>
            {idCollisions.fieldIdCollisions.map((c) => (
              <li key={`field-${c.id}`}>
                Field ID <code>{c.id}</code> is used by {c.locations.length}{" "}
                fields:{" "}
                {formatCollisionLocations(
                  c.locations.map(
                    (l) => `${l.stepTitle || l.stepId} › ${l.display}`,
                  ),
                )}
              </li>
            ))}
            {idCollisions.stepIdCollisions.map((c) => (
              <li key={`step-${c.stepId}`}>
                Step ID <code>{c.stepId}</code> is used by {c.locations.length}{" "}
                steps:{" "}
                {formatCollisionLocations(
                  c.locations.map((l) => l.stepTitle || l.stepId),
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ValidationPanel result={validateResult} onDismiss={dismiss} />
      </div>

      {isPickerOpen && (
        <FormPicker
          forms={forms}
          loadError={formsLoadError}
          isDirty={isDirty}
          catalog={catalog}
          onLoad={handleLoad}
          onClose={() => setIsPickerOpen(false)}
          onRequestDelete={handleRequestDelete}
          onRequestDisable={handleRequestDisable}
          onRequestErase={handleRequestErase}
          onEnable={handleEnable}
          onDuplicate={handleDuplicate}
        />
      )}

      {isPreviewOpen && (
        <PreviewModal
          contract={previewData}
          isLoading={isPreviewing}
          error={previewError}
          previewUrl={loadedFromId ? formPreviewUrl(loadedFromId) : null}
          recipe={previewRecipeJson}
          onClose={() => { setIsPreviewOpen(false); setPreviewData(null); setPreviewError(null); setPreviewRecipeJson(null); }}
        />
      )}

      {isSubmitOpen && (
        <SubmitModal
          draft={draft}
          loadedFromId={loadedFromId}
          isSubmitting={isSubmitting}
          submitSuccess={submitSuccess}
          submitError={submitError}
          isReadOnly={isReadOnly}
          onSubmit={handleSubmit}
          onClose={() => setIsSubmitOpen(false)}
        />
      )}

      {isPublishOpen && (
        <PublishModal
          draft={draft}
          baseBranch={baseBranch}
          isPublishing={isPublishing}
          publishSuccess={publishSuccess}
          publishError={publishError}
          isReadOnly={isReadOnly}
          onPublish={handlePublish}
          onClose={handleClosePublish}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          formId={deleteTarget.formId}
          title={deleteTarget.title}
          isDeleting={isDeleting}
          deleteError={deleteError}
          onConfirm={handleConfirmDelete}
          onClose={handleCloseDelete}
        />
      )}

      {disableTarget && (
        <DisableModal
          formId={disableTarget.formId}
          title={disableTarget.title}
          isDisabling={isDisabling}
          disableError={disableError}
          onConfirm={handleConfirmDisable}
          onClose={handleCloseDisable}
        />
      )}

      {eraseTarget && (
        <EraseModal
          formId={eraseTarget.formId}
          title={eraseTarget.title}
          isErasing={isErasing}
          eraseSuccess={eraseSuccess}
          eraseError={eraseError}
          onConfirm={handleConfirmErase}
          onClose={handleCloseErase}
        />
      )}
      </div>

      <AiSidebar
        draft={draft}
        onApplyRecipe={applyAiRecipe}
      />
      </div>
    </div>
  );
}
