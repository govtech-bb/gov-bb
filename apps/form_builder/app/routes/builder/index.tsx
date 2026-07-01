import "../../styles/builder.global.css";
import { createFileRoute } from "@tanstack/react-router";
import { useReducer, useState, useMemo, useEffect } from "react";
import { getCatalogFn } from "../../server/registry";
import { createMdaContact } from "../../server/mda-contacts";
import { getPublishBaseBranch } from "../../server/publish";
import { previewRecipe } from "../../server/registry";
import { serializeRecipeDraft, findRecipeIdCollisions, resolveFieldIds } from "@govtech-bb/form-builder";
import type {
  ServiceContract,
  ServiceContractRecipe,
  RecipeVisibility,
} from "@govtech-bb/form-types";
import {
  getRecipeVisibility,
} from "@govtech-bb/form-types";
import type { RecipeDraft } from "@govtech-bb/form-builder";

import { Moon02Icon, Sun03Icon } from "hugeicons-react";

import { SectionSwitch } from "../../components/section-switch";
import { Tip } from "../content/-sliding-tabs";
import { useTheme } from "../content/-use-theme";
import { draftsEqual } from "./-apply-recipe";
import { AiSidebar } from "./-ai-sidebar";
import { recipeReducer, EMPTY_DRAFT, nextStepId, REQUIRED_STEP_IDS } from "./-recipe-reducer";
import { Toolbar } from "./-toolbar";
import { usePresence } from "./-use-presence";
import { PresenceBanner } from "./-presence-banner";
import { StepList } from "./-step-list";
import { BuilderPanel } from "./-builder-panel";
import { CollisionBanner } from "./-collision-banner";
import { BuilderModals } from "./-builder-modals";
import { ValidationPanel } from "./-validation-panel";
import { checkFormUniqueness, checkRekeyPublished } from "./-form-uniqueness";
import { useFormsList } from "./-use-forms-list";
import { useMdaContacts } from "./-use-mda-contacts";
import { useRecipeValidation } from "./-use-recipe-validation";
import { useRecipeSave } from "./-use-recipe-save";
import { useDraftLifecycle } from "./-use-draft-lifecycle";
import { useFormManagement } from "./-use-form-management";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";

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

  // Draft lifecycle: load / apply-AI / new / discard / duplicate + the shared
  // editor reset. Takes every setter it orchestrates (validation, save, preview,
  // nav) since the reset crosscuts all those clusters.
  const {
    handleLoad,
    applyAiRecipe,
    handleNew,
    handleDiscard,
    handleDuplicate,
  } = useDraftLifecycle({
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
  });

  // Form management: delete / disable / erase / enable, off the Open picker.
  const {
    deleteTarget,
    isDeleting,
    deleteError,
    disableTarget,
    isDisabling,
    disableError,
    eraseTarget,
    isErasing,
    eraseError,
    eraseSuccess,
    handleRequestDelete,
    handleConfirmDelete,
    handleCloseDelete,
    handleRequestDisable,
    handleConfirmDisable,
    handleCloseDisable,
    handleRequestErase,
    handleConfirmErase,
    handleCloseErase,
    handleEnable,
  } = useFormManagement({
    loadedFromId,
    onClearEditor: handleNew,
    refetchForms,
    setIsPickerOpen,
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

        <BuilderPanel
          mainView={mainView}
          draft={draft}
          dispatch={dispatch}
          catalog={catalog}
          selectedStep={selectedStep}
          mdaContacts={mdaContacts}
          mdaContactsLoadError={mdaContactsLoadError}
          resolvedFieldIds={resolvedFieldIds}
          onCreateContact={handleCreateMdaContact}
          onStepIdChange={handleStepIdChange}
        />
      </div>

      {/* Floating over the canvas (not in-flow) so appearing/dismissing never
          reflows the editor underneath. */}
      <div className={styles.bannerStack}>
      <CollisionBanner idCollisions={idCollisions} />

      <ValidationPanel result={validateResult} onDismiss={dismiss} />
      </div>

      <BuilderModals
        isPickerOpen={isPickerOpen}
        forms={forms}
        formsLoadError={formsLoadError}
        isDirty={isDirty}
        catalog={catalog}
        onLoad={handleLoad}
        onClosePicker={() => setIsPickerOpen(false)}
        onRequestDelete={handleRequestDelete}
        onRequestDisable={handleRequestDisable}
        onRequestErase={handleRequestErase}
        onEnable={handleEnable}
        onDuplicate={handleDuplicate}
        isPreviewOpen={isPreviewOpen}
        previewData={previewData}
        isPreviewing={isPreviewing}
        previewError={previewError}
        loadedFromId={loadedFromId}
        previewRecipeJson={previewRecipeJson}
        onClosePreview={() => { setIsPreviewOpen(false); setPreviewData(null); setPreviewError(null); setPreviewRecipeJson(null); }}
        isSubmitOpen={isSubmitOpen}
        draft={draft}
        isSubmitting={isSubmitting}
        submitSuccess={submitSuccess}
        submitError={submitError}
        isReadOnly={isReadOnly}
        onSubmit={handleSubmit}
        onCloseSubmit={() => setIsSubmitOpen(false)}
        isPublishOpen={isPublishOpen}
        baseBranch={baseBranch}
        isPublishing={isPublishing}
        publishSuccess={publishSuccess}
        publishError={publishError}
        onPublish={handlePublish}
        onClosePublish={handleClosePublish}
        deleteTarget={deleteTarget}
        isDeleting={isDeleting}
        deleteError={deleteError}
        onConfirmDelete={handleConfirmDelete}
        onCloseDelete={handleCloseDelete}
        disableTarget={disableTarget}
        isDisabling={isDisabling}
        disableError={disableError}
        onConfirmDisable={handleConfirmDisable}
        onCloseDisable={handleCloseDisable}
        eraseTarget={eraseTarget}
        isErasing={isErasing}
        eraseError={eraseError}
        eraseSuccess={eraseSuccess}
        onConfirmErase={handleConfirmErase}
        onCloseErase={handleCloseErase}
      />
      </div>

      <AiSidebar
        draft={draft}
        onApplyRecipe={applyAiRecipe}
      />
      </div>
    </div>
  );
}
