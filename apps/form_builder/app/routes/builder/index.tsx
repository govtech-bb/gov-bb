import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useReducer, useState, useRef, useEffect } from "react";
import { getCatalogFn } from "../../server/registry";
import { listForms, nextVersion, submitRecipe, updateRecipe, publishRecipe, unpublishRecipe } from "../../server/forms";
import { validateRecipe, previewRecipe } from "../../server/registry";
import { serializeRecipeDraft } from "@govtech-bb/form-builder";
import { bumpMinor } from "../../lib/version";
import type { ServiceContract } from "@govtech-bb/form-types";
import type { RecipeDraft, ValidationIssue, ValidationResult } from "@govtech-bb/form-builder";

import { recipeReducer, EMPTY_DRAFT } from "./-recipe-reducer";
import { useFieldRefs, useStepRefs } from "./-recipe-refs";
import { Toolbar } from "./-toolbar";
import { StepList } from "./-step-list";
import { StepEditor } from "./-step-editor";
import { FieldPicker } from "./-field-picker";
import { FieldEditPanel } from "./-field-edit-panel";
import { ValidationPanel } from "./-validation-panel";
import { PreviewModal } from "./-preview-modal";
import { SubmitModal } from "./-submit-modal";
import { FormPicker } from "./-form-picker";

import styles from "../../styles/builder.module.css";

export const Route = createFileRoute("/builder/")({
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
  const [draft, dispatch] = useReducer(recipeReducer, EMPTY_DRAFT);

  // UI state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [version, setVersion] = useState("1.0.0");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [loadedFromId, setLoadedFromId] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<{ valid: boolean; errors: ValidationIssue[] } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<ServiceContract | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activeFieldEdit, setActiveFieldEdit] = useState<{ stepId: string; fieldRef: string } | null>(null);
  const [activeFieldPickerStepId, setActiveFieldPickerStepId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const router = useRouter();

  // Derived
  const fieldRefs = useFieldRefs(draft, catalog);
  const stepRefs = useStepRefs(draft);
  const selectedStep = draft.steps.find((s) => s.stepId === selectedStepId) ?? null;
  const isDirty = draft.steps.length > 0 || draft.formId !== "" || draft.title !== "";

  // Debounced nextVersion fetch when formId changes
  const nextVersionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draft.formId) return;
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
      const recipe = serializeRecipeDraft(draft, { version });
      const result = await validateRecipe({ data: { recipe } }) as ValidationResult;
      setValidateResult({ valid: result.ok, errors: result.ok ? [] : result.issues });
    } catch (e) {
      setValidateResult({
        valid: false,
        errors: [{ path: "", message: e instanceof Error ? e.message : "Validation request failed" }],
      });
    } finally {
      setIsValidating(false);
    }
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
      if (loadedFromId) {
        await updateRecipe({ data: { formId: loadedFromId, recipe } });
      } else {
        await submitRecipe({ data: { recipe } });
      }
      setSubmitSuccess(true);
      setIsPublished(false);
      setCurrentVersion(submitVersion);
      setLoadedFromId(draft.formId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoad = (loadedDraft: RecipeDraft, formId: string, ver: string) => {
    dispatch({ type: "LOAD_DRAFT", draft: loadedDraft });
    setLoadedFromId(formId);
    setCurrentVersion(ver);
    setVersion(ver);
    setSelectedStepId(null);
    setValidateResult(null);
    setIsPublished(forms.find((f) => f.formId === formId)?.isPublished ?? false);
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
    setIsPublished(false);
  };

  const handlePublish = async () => {
    if (!loadedFromId) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      await publishRecipe({ data: { formId: loadedFromId } });
      setIsPublished(true);
      router.invalidate();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!loadedFromId) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      await unpublishRecipe({ data: { formId: loadedFromId } });
      setIsPublished(false);
      router.invalidate();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Unpublish failed");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleFormIdChange = (id: string) => {
    dispatch({ type: "SET_FORM_META", formId: id, title: draft.title, description: draft.description });
  };

  const handleTitleChange = (title: string) => {
    dispatch({ type: "SET_FORM_META", formId: draft.formId, title, description: draft.description });
  };

  const handleAddStep = () => {
    dispatch({ type: "ADD_STEP" });
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

  // Find the field being edited
  const fieldBeingEdited = activeFieldEdit
    ? draft.steps
        .find((s) => s.stepId === activeFieldEdit.stepId)
        ?.fields.find((f) => f.ref === activeFieldEdit.fieldRef) ?? null
    : null;

  return (
    <div className={styles.builderRoot}>
      <Toolbar
        formId={draft.formId}
        title={draft.title}
        version={version}
        isDirty={isDirty}
        isValidating={isValidating}
        isPreviewing={isPreviewing}
        isPublished={isPublished}
        isPublishing={isPublishing}
        loadedFromId={loadedFromId}
        onFormIdChange={handleFormIdChange}
        onTitleChange={handleTitleChange}
        onNew={handleNew}
        onOpen={() => setIsPickerOpen(true)}
        onValidate={handleValidate}
        onPreview={handlePreview}
        onSubmit={() => { setSubmitSuccess(false); setSubmitError(null); setIsSubmitOpen(true); }}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        publishError={publishError}
        onClearPublishError={() => setPublishError(null)}
      />

      <div className={styles.builderBody}>
        <StepList
          steps={draft.steps}
          selectedStepId={selectedStepId}
          onSelect={setSelectedStepId}
          onAdd={handleAddStep}
          onRemove={handleRemoveStep}
          onMoveUp={handleMoveStepUp}
          onMoveDown={handleMoveStepDown}
        />

        {selectedStep ? (
          <StepEditor
            step={selectedStep}
            catalog={catalog}
            fieldRefs={fieldRefs}
            stepRefs={stepRefs}
            onUpdateMeta={(meta) =>
              dispatch({ type: "UPDATE_STEP_META", stepId: selectedStep.stepId, meta })
            }
            onSetBehaviours={(behaviours) =>
              dispatch({ type: "SET_STEP_BEHAVIOURS", stepId: selectedStep.stepId, behaviours })
            }
            onAddField={() => setActiveFieldPickerStepId(selectedStep.stepId)}
            onEditField={(fieldRef) =>
              setActiveFieldEdit({ stepId: selectedStep.stepId, fieldRef })
            }
            onRemoveField={(fieldRef) =>
              dispatch({ type: "REMOVE_FIELD", stepId: selectedStep.stepId, fieldRef })
            }
            onMoveFieldUp={(index) =>
              dispatch({
                type: "REORDER_FIELDS",
                stepId: selectedStep.stepId,
                fromIndex: index,
                toIndex: index - 1,
              })
            }
            onMoveFieldDown={(index) =>
              dispatch({
                type: "REORDER_FIELDS",
                stepId: selectedStep.stepId,
                fromIndex: index,
                toIndex: index + 1,
              })
            }
          />
        ) : (
          <div className={styles.noStepSelected}>Select or add a step to begin</div>
        )}
      </div>

      <ValidationPanel result={validateResult} />

      {isPickerOpen && (
        <FormPicker
          forms={forms}
          isDirty={isDirty}
          catalog={catalog}
          onLoad={handleLoad}
          onClose={() => setIsPickerOpen(false)}
        />
      )}

      {activeFieldPickerStepId && (
        <FieldPicker
          catalog={catalog}
          onPick={(field) =>
            dispatch({ type: "ADD_FIELD", stepId: activeFieldPickerStepId, field })
          }
          onClose={() => setActiveFieldPickerStepId(null)}
        />
      )}

      {activeFieldEdit && fieldBeingEdited && (
        <FieldEditPanel
          field={fieldBeingEdited}
          catalog={catalog}
          fieldRefs={fieldRefs}
          stepRefs={stepRefs}
          onSave={(overrides, childOverrides) =>
            dispatch({
              type: "UPDATE_FIELD_OVERRIDES",
              stepId: activeFieldEdit.stepId,
              fieldRef: activeFieldEdit.fieldRef,
              overrides,
              childOverrides,
            })
          }
          onClose={() => setActiveFieldEdit(null)}
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
    </div>
  );
}
