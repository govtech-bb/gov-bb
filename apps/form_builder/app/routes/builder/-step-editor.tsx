import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  RecipeDraft,
  RecipeStepDraft,
  RecipeFieldDraft,
  RegistryCatalog,
} from "@govtech-bb/form-builder";
import type { Behaviour } from "@govtech-bb/form-types";
import type { RecipeAction } from "./-recipe-reducer";
import { isNoFieldsStep, isRequiredStep } from "./-recipe-reducer";
import { KEBAB_ID_PATTERN, kebabize } from "./-id-validation";
import { getFieldRefs, getStepRefs } from "./-recipe-refs";
import { BehavioursEditor } from "./-behaviours-editor";
import { FieldPicker } from "./-field-picker";
import { FieldEditPanel } from "./-field-edit-panel";
import { SortableFieldRow } from "./-sortable-field-row";
import styles from "../../styles/builder.module.css";

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

  const fieldRefs = useMemo(
    () => getFieldRefs(draft, catalog),
    [draft, catalog],
  );
  const stepRefs = useMemo(() => getStepRefs(draft), [draft]);

  const editingField =
    editingFieldId !== null
      ? (step.fields.find((f) => f.id === editingFieldId) ?? null)
      : null;

  // Review/confirmation steps carry no author-added fields, so hide the entire
  // Fields section (list + picker) for them. See isNoFieldsStep.
  const noFields = isNoFieldsStep(step.stepId);

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

  // Require a small drag before activating so a click on the handle doesn't
  // start a drag — keeps the row's other buttons clickable.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleFieldDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = step.fields.findIndex((f) => f.id === active.id);
    const toIndex = step.fields.findIndex((f) => f.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    dispatch({
      type: "REORDER_FIELDS",
      stepId: step.stepId,
      fromIndex,
      toIndex,
    });
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
          onBlur={() => {
            // Mirror the Field ID Override input: normalize a non-kebab id on
            // blur (e.g. `step_one` → `step-one`) instead of leaving it to
            // fail server-side validation (#741).
            if (isRequiredStep(step.stepId)) return;
            const normalized = kebabize(localStepId);
            if (normalized && normalized !== localStepId) {
              handleStepIdChange(normalized);
            }
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

      {/* Fields list — hidden for review/confirmation steps that accept no
          fields. The "Add field" picker is split into its own block below so
          Step Behaviours can render between the list and the picker (#566). */}
      {!noFields && (
        <>
          <div className={styles.sectionTitle}>
            Fields ({step.fields.length})
          </div>
          <DndContext
            // Stable id pins dnd-kit's `aria-describedby` (otherwise derived
            // from a module-global counter) so it can never differ between a
            // server and client render → hydration mismatch (#546).
            id="step-fields-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFieldDragEnd}
          >
            <SortableContext
              items={step.fields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              {step.fields.map((field, idx) => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  catalog={catalog}
                  isFirst={idx === 0}
                  isLast={idx === step.fields.length - 1}
                  onMoveUp={() => handleMoveFieldUp(idx)}
                  onMoveDown={() => handleMoveFieldDown(idx)}
                  onEdit={() => setEditingFieldId(field.id)}
                  onRemove={() => handleRemoveField(field.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </>
      )}

      {/* Inline field edit panel — stays attached to the Fields list above. */}
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
        currentStepId={step.stepId}
      />

      {/* Inline field picker palette — renders below Step Behaviours (#566),
          hidden for no-fields steps alongside the Fields list. */}
      {!noFields && (
        <>
          <div className={styles.sectionTitle}>Add field</div>
          <FieldPicker catalog={catalog} onAddField={handleAddField} />
        </>
      )}
    </div>
  );
}
