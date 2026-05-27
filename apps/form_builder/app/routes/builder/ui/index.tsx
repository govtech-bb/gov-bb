import "../../../styles/builder.global.css";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useReducer, useState, useRef, useEffect, useMemo } from "react";
import { getCatalogFn } from "../../../server/registry";
import { listForms, nextVersion, submitRecipe, updateRecipe, deleteForm, getRecipe } from "../../../server/forms";
import { publishRecipe } from "../../../server/publish";
import { validateRecipe, previewRecipe } from "../../../server/registry";
import { serializeRecipeDraft, findRecipeIdCollisions, formatCollisionIssues } from "@govtech-bb/form-builder";
import { bumpMinor } from "../../../lib/version";
import type { ServiceContract, ServiceContractRecipe } from "@govtech-bb/form-types";
import type { RecipeDraft, ValidationResult, RecipeValidateResponse } from "@govtech-bb/form-builder";

import { parseBuilderSearch, buildLoadArgs } from "./-open-from-ai";
import { recipeReducer, EMPTY_DRAFT, nextStepId, REQUIRED_STEP_IDS, isRequiredStep } from "./-recipe-reducer";
import { Toolbar } from "./-toolbar";
import { StepList } from "./-step-list";
import { StepEditor } from "./-step-editor";
import { ValidationPanel } from "./-validation-panel";
import { PreviewModal } from "./-preview-modal";
import { SubmitModal } from "./-submit-modal";
import { PublishModal } from "./-publish-modal";
import { FormPicker } from "./-form-picker";
import { DeleteModal } from "./-delete-modal";
import type { FormDefinitionSummary } from "../../../types/index";

import styles from "../../../styles/builder.module.css";

export const Route = createFileRoute("/builder/ui/")({
  validateSearch: parseBuilderSearch,
  loader: async () => {
    const [catalog, forms] = await Promise.all([
      getCatalogFn(),
      listForms(),
    ]);
    return { catalog, forms };
  },
  component: BuilderPage,
});

function BuilderPage() {
  const { catalog, forms } = Route.useLoaderData();
  const { formId: openFormId } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [draft, dispatch] = useReducer(recipeReducer, EMPTY_DRAFT);

  // UI state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [version, setVersion] = useState("1.0.0");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [loadedFromId, setLoadedFromId] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<RecipeValidateResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<ServiceContract | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<
    { prUrl: string; prNumber: number } | null
  >(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [lastSaveStatus, setLastSaveStatus] = useState<"idle" | "success" | "error" | "submitted">("idle");
  const [deleteTarget, setDeleteTarget] = useState<FormDefinitionSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Auto-open-from-AI: a one-shot load driven by the `?formId=` handoff param.
  const [openError, setOpenError] = useState<string | null>(null);
  const openedRef = useRef(false);

  // Derived
  const selectedStep = draft.steps.find((s) => s.stepId === selectedStepId) ?? null;
  const isDirty =
    draft.steps.length > REQUIRED_STEP_IDS.length ||
    draft.formId !== "" ||
    draft.title !== "";
  const editableSteps = draft.steps.filter((s) => !isRequiredStep(s.stepId));
  const hasEditableSteps = editableSteps.length > 0;
  const allEditableStepsHaveFields = editableSteps.every((s) => s.fields.length > 0);
  // Live recipe-wide uniqueness check over resolved field ids + step ids. Folding
  // this into canSubmit (not only into handleValidate) matters because
  // validateResult is NOT reset when the draft is edited — a stale-green result
  // would otherwise leave the buttons enabled after a duplicate is introduced.
  const idCollisions = useMemo(
    () => findRecipeIdCollisions(draft, catalog),
    [draft, catalog],
  );
  const hasIdCollisions =
    idCollisions.fieldIdCollisions.length > 0 ||
    idCollisions.stepIdCollisions.length > 0;
  const canSubmit =
    validateResult?.valid === true &&
    hasEditableSteps &&
    allEditableStepsHaveFields &&
    !hasIdCollisions;

  // Debounced nextVersion fetch when formId changes
  const nextVersionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draft.formId) {
      setVersion("1.0.0");
      setCurrentVersion(null);
      return;
    }
    if (nextVersionTimerRef.current) clearTimeout(nextVersionTimerRef.current);
    nextVersionTimerRef.current = setTimeout(async () => {
      try {
        const result = await nextVersion({ data: { formId: draft.formId } }) as { currentVersion: string | null; nextVersion: string };
        setCurrentVersion(result.currentVersion ?? null);
        setVersion(result.nextVersion);
      } catch {
        setVersion(bumpMinor(currentVersion ?? "1.0.0"));
      }
    }, 300);
    return () => {
      if (nextVersionTimerRef.current) clearTimeout(nextVersionTimerRef.current);
    };
  }, [draft.formId]);

  // Handlers
  const handleValidate = async () => {
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
        return;
      }
      const emptyStep = editableSteps.find((s) => s.fields.length === 0);
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
        return;
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
        return;
      }

      const recipe = serializeRecipeDraft(draft, { version });
      const raw = (await validateRecipe({ data: { recipe } })) as ValidationResult;
      const result: RecipeValidateResponse = {
        valid: raw.ok,
        issues: raw.ok ? [] : raw.issues,
      };
      setValidateResult(result);
      setLastSaveStatus(raw.ok ? "success" : "error");
    } catch (e) {
      const result: RecipeValidateResponse = {
        valid: false,
        issues: [
          { path: "", message: e instanceof Error ? e.message : "Validation request failed" },
        ],
      };
      setValidateResult(result);
      setLastSaveStatus("error");
    } finally {
      setIsValidating(false);
    }
  };

  const handleDismissValidation = () => {
    setValidateResult(null);
    setLastSaveStatus("idle");
  };

  const handlePreview = async () => {
    setIsPreviewOpen(true);
    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const recipe = serializeRecipeDraft(draft, { version });
      const contract = await previewRecipe({ data: { recipe } }) as ServiceContract;
      setPreviewData(contract as ServiceContract);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview request failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSubmit = async (submitVersion: string) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const recipe = serializeRecipeDraft(draft, { version: submitVersion });
      if (loadedFromId && currentVersion && submitVersion === currentVersion) {
        await updateRecipe({ data: { formId: loadedFromId, recipe } });
      } else {
        await submitRecipe({ data: { recipe } });
      }
      setSubmitSuccess(true);
      setLastSaveStatus("submitted");
      setLoadedFromId(draft.formId);

      // Bump to next version so a follow-up submit doesn't conflict
      try {
        const next = (await nextVersion({ data: { formId: draft.formId } })) as {
          currentVersion: string | null;
          nextVersion: string;
        };
        setCurrentVersion(next.currentVersion ?? submitVersion);
        setVersion(next.nextVersion);
      } catch {
        setCurrentVersion(submitVersion);
        setVersion(bumpMinor(submitVersion));
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenPublish = () => {
    setPublishSuccess(null);
    setPublishError(null);
    setIsPublishOpen(true);
  };

  const handlePublish = async (description: string) => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      const recipe = serializeRecipeDraft(draft, { version });
      const result = await publishRecipe({
        data: { recipe, description },
      });
      setPublishSuccess(result);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleClosePublish = () => {
    setIsPublishOpen(false);
    setPublishSuccess(null);
    setPublishError(null);
  };

  const handleLoad = (loadedDraft: RecipeDraft, formId: string, ver: string) => {
    dispatch({ type: "LOAD_DRAFT", draft: loadedDraft });
    setLoadedFromId(formId);
    setCurrentVersion(ver);
    setVersion(ver);
    setSelectedStepId(null);
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setPreviewError(null);
    setLastSaveStatus("idle");
  };

  // Open-from-AI: when arriving with `?formId=`, fetch that recipe and load it
  // into the builder exactly as the Open picker would, then strip the param so a
  // refresh can't re-trigger the load or clobber edits. Ref-guarded so it runs
  // once (incl. StrictMode double-invoke). Errors surface; they don't fail silently.
  useEffect(() => {
    if (openedRef.current || !openFormId) return;
    openedRef.current = true;
    setOpenError(null);
    (async () => {
      try {
        const recipe = (await getRecipe({
          data: { formId: openFormId },
        })) as ServiceContractRecipe;
        const { draft: loaded, version } = buildLoadArgs(recipe, catalog);
        handleLoad(loaded, openFormId, version);
      } catch (e) {
        setOpenError(
          e instanceof Error ? e.message : "Failed to open form",
        );
      } finally {
        navigate({ to: "/builder/ui", search: {}, replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFormId]);

  const handleSwitchToAi = () => {
    if (isDirty && !window.confirm("Unsaved changes will be lost. Continue?")) return;
    navigate({ to: "/builder/ai" });
  };

  const handleNew = () => {
    dispatch({ type: "RESET" });
    setSelectedStepId(null);
    setVersion("1.0.0");
    setCurrentVersion(null);
    setLoadedFromId(null);
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setLastSaveStatus("idle");
    // Close all open panels/modals
    setIsPickerOpen(false);
    setIsSubmitOpen(false);
    setIsPreviewOpen(false);
    // Clear transient errors
    setPreviewError(null);
  };

  const handleRequestDelete = (form: FormDefinitionSummary) => {
    setDeleteError(null);
    setDeleteTarget(form);
    setIsPickerOpen(false);
  };

  const handleConfirmDelete = async (reason: string) => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteForm({ data: { formId: deleteTarget.formId, reason } });
      // If the deleted form is the one open in the editor, clear it.
      if (loadedFromId === deleteTarget.formId) handleNew();
      setDeleteTarget(null);
      // Re-run the route loader so the forms list drops the deleted entry.
      await router.invalidate();
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

  const handleFormIdChange = (id: string) => {
    dispatch({ type: "SET_FORM_META", formId: id, title: draft.title, description: draft.description });
  };

  const handleTitleChange = (title: string) => {
    dispatch({ type: "SET_FORM_META", formId: draft.formId, title, description: draft.description });
  };

  const handleAddStep = () => {
    const stepId = nextStepId(draft.steps);
    dispatch({ type: "ADD_STEP" });
    setSelectedStepId(stepId);
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
    <div className={styles.builderRoot}>
      <Toolbar
        formId={draft.formId}
        title={draft.title}
        version={version}
        isDirty={isDirty}
        isValidating={isValidating}
        isPreviewing={isPreviewing}
        isSubmitting={isSubmitting}
        isPublishing={isPublishing}
        canSubmit={canSubmit}
        lastSaveStatus={lastSaveStatus}
        onFormIdChange={handleFormIdChange}
        onTitleChange={handleTitleChange}
        onNew={handleNew}
        onOpen={() => setIsPickerOpen(true)}
        onValidate={handleValidate}
        onPreview={handlePreview}
        onSubmit={() => { setSubmitSuccess(false); setSubmitError(null); setIsSubmitOpen(true); }}
        onPublish={handleOpenPublish}
      />

      {openError && (
        <div className={styles.validationErrors} role="alert">
          <strong>Could not open form:</strong> {openError}
        </div>
      )}

      <div className={styles.builderBody}>
        <StepList
          steps={draft.steps}
          selectedStepId={selectedStepId}
          onSelect={setSelectedStepId}
          onAdd={handleAddStep}
          onRemove={handleRemoveStep}
          onMoveUp={handleMoveStepUp}
          onMoveDown={handleMoveStepDown}
          onSwitchToAi={handleSwitchToAi}
        />

        {selectedStep !== null ? (
          <StepEditor
            step={selectedStep}
            draft={draft}
            dispatch={dispatch}
            catalog={catalog}
            onStepIdChange={handleStepIdChange}
          />
        ) : (
          <div className={styles.noStepSelected}>Select or add a step to begin</div>
        )}
      </div>

      {hasIdCollisions && (
        <div className={styles.validationErrors} role="alert">
          <strong>Duplicate IDs must be fixed before saving or deploying</strong>
          <ul>
            {idCollisions.fieldIdCollisions.map((c) => (
              <li key={`field-${c.id}`}>
                Field ID <code>{c.id}</code> is used by {c.locations.length}{" "}
                fields:{" "}
                {c.locations
                  .map((l) => `${l.stepTitle || l.stepId} › ${l.display}`)
                  .join("; ")}
              </li>
            ))}
            {idCollisions.stepIdCollisions.map((c) => (
              <li key={`step-${c.stepId}`}>
                Step ID <code>{c.stepId}</code> is used by {c.locations.length}{" "}
                steps:{" "}
                {c.locations.map((l) => l.stepTitle || l.stepId).join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ValidationPanel result={validateResult} onDismiss={handleDismissValidation} />

      {isPickerOpen && (
        <FormPicker
          forms={forms}
          isDirty={isDirty}
          catalog={catalog}
          onLoad={handleLoad}
          onClose={() => setIsPickerOpen(false)}
          onRequestDelete={handleRequestDelete}
        />
      )}

      {isPreviewOpen && (
        <PreviewModal
          contract={previewData}
          isLoading={isPreviewing}
          error={previewError}
          onClose={() => { setIsPreviewOpen(false); setPreviewData(null); setPreviewError(null); }}
        />
      )}

      {isSubmitOpen && (
        <SubmitModal
          draft={draft}
          version={version}
          currentVersion={currentVersion}
          loadedFromId={loadedFromId}
          isSubmitting={isSubmitting}
          submitSuccess={submitSuccess}
          submitError={submitError}
          onSubmit={handleSubmit}
          onClose={() => setIsSubmitOpen(false)}
        />
      )}

      {isPublishOpen && (
        <PublishModal
          draft={draft}
          version={version}
          isPublishing={isPublishing}
          publishSuccess={publishSuccess}
          publishError={publishError}
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
    </div>
  );
}
