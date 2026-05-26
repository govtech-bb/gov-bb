import { useState, useMemo, useEffect } from "react";
import type {
  RecipeDraft,
  RecipeStepDraft,
  RecipeFieldDraft,
  RegistryCatalog,
} from "@govtech-bb/form-builder";
import { getRegistryItem } from "@govtech-bb/form-builder";
import type { Behaviour } from "@govtech-bb/form-types";
import type { RecipeAction } from "./-recipe-reducer";
import { isRequiredStep } from "./-recipe-reducer";
import { KEBAB_ID_PATTERN, kebabize } from "./-id-validation";
import { getFieldRefs, getStepRefs } from "./-recipe-refs";
import { BehavioursEditor } from "./-behaviours-editor";
import { FieldPicker } from "./-field-picker";
import { FieldEditPanel } from "./-field-edit-panel";
import { resolveFieldLabel } from "./-field-label";
import styles from "../../../styles/builder.module.css";

const STEP_ID_ERROR =
  "Use lowercase letters, digits, and hyphens only. Must start with a letter (e.g. my-step, step-1).";
const STEP_ID_DUPLICATE_ERROR =
  "This Step ID is already used by another step. Step IDs must be unique within a form.";
const STEP_ID_DEFAULT_PATTERN = /^step-\d+$/;

interface StepEditorProps {
  step: RecipeStepDraft;
  draft: RecipeDraft;
  dispatch: React.Dispatch<RecipeAction>;
  catalog: RegistryCatalog;
  onStepIdChange: (oldId: string, newId: string) => void;
}

export function StepEditor({
  step,
  draft,
  dispatch,
  catalog,
  onStepIdChange,
}: StepEditorProps) {
  const [localStepId, setLocalStepId] = useState(step.stepId);
  const [stepIdError, setStepIdError] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  // Keep localStepId in sync when a different step is selected from the sidebar.
  useEffect(() => {
    setLocalStepId(step.stepId);
    setStepIdError("");
    setEditingFieldId(null);
  }, [step.stepId]);

  const fieldRefs = useMemo(() => getFieldRefs(draft, catalog), [draft, catalog]);
  const stepRefs = useMemo(() => getStepRefs(draft), [draft]);

  const editingField =
    editingFieldId !== null
      ? (step.fields.find((f) => f.id === editingFieldId) ?? null)
      : null;

  function handleStepIdChange(newId: string) {
    setLocalStepId(newId);
    if (!KEBAB_ID_PATTERN.test(newId)) {
      setStepIdError(STEP_ID_ERROR);
      return;
    }
    // Reject a stepId that collides with another step (recipe-wide uniqueness).
    const duplicate = draft.steps.some(
      (s) => s.stepId !== step.stepId && s.stepId === newId,
    );
    if (duplicate) {
      setStepIdError(STEP_ID_DUPLICATE_ERROR);
      return;
    }
    setStepIdError("");
    dispatch({
      type: "UPDATE_STEP_META",
      stepId: step.stepId,
      meta: { stepId: newId },
    });
    onStepIdChange(step.stepId, newId);
  }

  function handleAddField(field: Omit<RecipeFieldDraft, "id">) {
    dispatch({ type: "ADD_FIELD", stepId: step.stepId, field });
  }

  function handleRemoveField(fieldId: string) {
    if (!window.confirm("Remove this field?")) return;
    dispatch({ type: "REMOVE_FIELD", stepId: step.stepId, fieldId });
    if (editingFieldId === fieldId) setEditingFieldId(null);
  }

  function handleMoveFieldUp(index: number) {
    if (index <= 0) return;
    dispatch({
      type: "REORDER_FIELDS",
      stepId: step.stepId,
      fromIndex: index,
      toIndex: index - 1,
    });
  }

  function handleMoveFieldDown(index: number) {
    if (index >= step.fields.length - 1) return;
    dispatch({
      type: "REORDER_FIELDS",
      stepId: step.stepId,
      fromIndex: index,
      toIndex: index + 1,
    });
  }

  function handleSetBehaviours(behaviours: Behaviour[]) {
    dispatch({ type: "SET_STEP_BEHAVIOURS", stepId: step.stepId, behaviours });
  }

  return (
    <div className={styles.stepEditor}>
      {/* Step Metadata */}
      <div className={styles.sectionTitle}>Step Metadata</div>
      <div className={styles.formGroup}>
        <label>Step ID</label>
        <input
          type="text"
          value={localStepId}
          readOnly={isRequiredStep(step.stepId)}
          onChange={(e) => {
            if (isRequiredStep(step.stepId)) return;
            handleStepIdChange(e.target.value);
          }}
          aria-invalid={stepIdError ? true : undefined}
        />
        {stepIdError && (
          <span role="alert" style={{ fontSize: "0.75rem", color: "red" }}>
            {stepIdError}
          </span>
        )}
      </div>
      <div className={styles.formGroup}>
        <label>Title</label>
        <input
          type="text"
          value={step.title}
          onChange={(e) =>
            dispatch({
              type: "UPDATE_STEP_META",
              stepId: step.stepId,
              meta: { title: e.target.value },
            })
          }
          onBlur={(e) => {
            const title = e.target.value;
            if (!title) return;
            // Auto-derive stepId only if it's still the default placeholder (step-N)
            // and the user has not started editing it manually.
            const isDefault = STEP_ID_DEFAULT_PATTERN.test(step.stepId);
            const localUntouched = localStepId === step.stepId;
            if (isDefault && localUntouched) {
              const derived = kebabize(title);
              if (derived && derived !== step.stepId) {
                dispatch({
                  type: "UPDATE_STEP_META",
                  stepId: step.stepId,
                  meta: { stepId: derived },
                });
                onStepIdChange(step.stepId, derived);
              }
            }
          }}
        />
      </div>
      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={step.description ?? ""}
          onChange={(e) =>
            dispatch({
              type: "UPDATE_STEP_META",
              stepId: step.stepId,
              meta: { description: e.target.value || undefined },
            })
          }
          rows={2}
        />
      </div>

      {/* Fields */}
      <div className={styles.sectionTitle}>Fields ({step.fields.length})</div>
      {step.fields.map((field, idx) => {
        const item = getRegistryItem(field.ref, catalog);
        const label = resolveFieldLabel(field, item);
        const displayName = item?.displayName ?? field.ref;
        const showSecondary = displayName !== label;
        const hasOverrides =
          Object.keys(field.overrides ?? {}).length > 0 ||
          (field.kind === "block" && Object.keys(field.childOverrides ?? {}).length > 0);
        return (
          <div key={field.id} className={styles.fieldRow}>
            <div style={{ flex: 1 }}>
              <div>
                {hasOverrides && <span className={styles.overrideDot} title="Has overrides" />}
                {label}
              </div>
              {showSecondary && (
                <div className={styles.fieldRowSecondary}>{displayName}</div>
              )}
            </div>
            <span className={styles.badge}>{field.kind}</span>
            <button
              type="button"
              title="Move up"
              disabled={idx === 0}
              onClick={() => handleMoveFieldUp(idx)}
            >
              ▲
            </button>
            <button
              type="button"
              title="Move down"
              disabled={idx === step.fields.length - 1}
              onClick={() => handleMoveFieldDown(idx)}
            >
              ▼
            </button>
            <button type="button" onClick={() => setEditingFieldId(field.id)}>
              Edit
            </button>
            <button type="button" onClick={() => handleRemoveField(field.id)}>
              ×
            </button>
          </div>
        );
      })}

      {/* Inline field picker palette */}
      <div className={styles.sectionTitle}>Add field</div>
      <FieldPicker catalog={catalog} onAddField={handleAddField} />

      {/* Inline field edit panel */}
      {editingField !== null && editingFieldId !== null && (
        <FieldEditPanel
          field={editingField}
          catalog={catalog}
          draft={draft}
          stepId={step.stepId}
          dispatch={dispatch}
          onClose={() => setEditingFieldId(null)}
        />
      )}

      {/* Step behaviours */}
      <div className={styles.sectionTitle}>Step Behaviours</div>
      <BehavioursEditor
        scope="step"
        behaviours={step.behaviours}
        fieldRefs={fieldRefs}
        stepRefs={stepRefs}
        onChange={handleSetBehaviours}
      />
    </div>
  );
}
