import type { RecipeStepDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import { getRegistryItem } from "@govtech-bb/form-builder";
import type { Behaviour } from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { BehavioursEditor } from "./-behaviours-editor";
import styles from "../../styles/builder.module.css";

interface StepEditorProps {
  step: RecipeStepDraft;
  catalog: RegistryCatalog;
  fieldRefs: FieldRef[];
  stepRefs: StepRef[];
  onUpdateMeta: (meta: Partial<Pick<RecipeStepDraft, "stepId" | "title" | "description">>) => void;
  onSetBehaviours: (behaviours: Behaviour[]) => void;
  onAddField: () => void;
  onEditField: (fieldRef: string) => void;
  onRemoveField: (fieldRef: string) => void;
  onMoveFieldUp: (index: number) => void;
  onMoveFieldDown: (index: number) => void;
}

export function StepEditor({
  step,
  catalog,
  fieldRefs,
  stepRefs,
  onUpdateMeta,
  onSetBehaviours,
  onAddField,
  onEditField,
  onRemoveField,
  onMoveFieldUp,
  onMoveFieldDown,
}: StepEditorProps) {
  function handleRemoveField(fieldRef: string) {
    if (!window.confirm("Remove this field?")) return;
    onRemoveField(fieldRef);
  }

  return (
    <div className={styles.stepEditor}>
      {/* Section 1: Step Metadata */}
      <div className={styles.sectionTitle}>Step Metadata</div>
      <div className={styles.formGroup}>
        <label>Step ID</label>
        <input
          type="text"
          value={step.stepId}
          onChange={(e) => onUpdateMeta({ stepId: e.target.value })}
        />
      </div>
      <div className={styles.formGroup}>
        <label>Title</label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => onUpdateMeta({ title: e.target.value })}
        />
      </div>
      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={step.description ?? ""}
          onChange={(e) => onUpdateMeta({ description: e.target.value || undefined })}
          rows={2}
        />
      </div>

      {/* Section 2: Fields */}
      <div className={styles.sectionTitle}>Fields</div>
      {step.fields.map((field, index) => {
        const item = getRegistryItem(field.ref, catalog);
        const displayName = item?.displayName ?? field.ref;
        return (
          <div key={index} className={styles.fieldRow}>
            <span style={{ flex: 1 }}>{displayName}</span>
            <span className={styles.badge}>{field.kind}</span>
            <button
              type="button"
              title="Move up"
              disabled={index === 0}
              onClick={() => onMoveFieldUp(index)}
            >
              ▲
            </button>
            <button
              type="button"
              title="Move down"
              disabled={index === step.fields.length - 1}
              onClick={() => onMoveFieldDown(index)}
            >
              ▼
            </button>
            <button type="button" onClick={() => onEditField(field.ref)}>Edit</button>
            <button type="button" onClick={() => handleRemoveField(field.ref)}>×</button>
          </div>
        );
      })}
      <button type="button" onClick={onAddField} style={{ marginTop: 8 }}>+ Add Field</button>

      {/* Section 3: Step Behaviours */}
      <div className={styles.sectionTitle}>Step Behaviours</div>
      <BehavioursEditor
        scope="step"
        behaviours={step.behaviours}
        fieldRefs={fieldRefs}
        stepRefs={stepRefs}
        onChange={onSetBehaviours}
      />
    </div>
  );
}
