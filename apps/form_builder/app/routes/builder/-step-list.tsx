import type { RecipeStepDraft } from "@govtech-bb/form-builder";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
} from "hugeicons-react";
import styles from "../../styles/builder.module.css";
import { isRequiredStep, REQUIRED_STEP_IDS } from "./-recipe-reducer";

interface StepListProps {
  steps: RecipeStepDraft[];
  selectedStepId: string | null;
  onSelect: (stepId: string) => void;
  onAdd: () => void;
  onRemove: (stepId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  processorCount: number;
  isProcessorsActive: boolean;
  onSelectProcessors: () => void;
  hasContactDetails: boolean;
  isContactDetailsActive: boolean;
  onSelectContactDetails: () => void;
}

export function StepList({
  steps,
  selectedStepId,
  onSelect,
  onAdd,
  onRemove,
  onMoveUp,
  onMoveDown,
  processorCount,
  isProcessorsActive,
  onSelectProcessors,
  hasContactDetails,
  isContactDetailsActive,
  onSelectContactDetails,
}: StepListProps) {
  const editableCount = steps.length - REQUIRED_STEP_IDS.length;

  function handleRemove(stepId: string) {
    if (!window.confirm("Delete this step?")) return;
    onRemove(stepId);
  }

  return (
    <div className={styles.stepList}>
      <div className={styles.railTitle}>Steps</div>
      {steps.map((step, index) => (
        <div
          key={step.stepId}
          className={`${styles.stepRow} ${step.stepId === selectedStepId ? styles.stepRowActive : ""}`}
          onClick={() => onSelect(step.stepId)}
        >
          <span className={styles.stepIndex}>{index + 1}</span>
          {/* The select affordance is a real button (the row div also stays
              clickable for the larger hit area) so the rail is keyboard- and
              screen-reader-reachable. It can't be the row itself: the
              reorder/delete buttons inside would nest interactives. */}
          <button
            type="button"
            className={styles.stepRowTitle}
            aria-current={step.stepId === selectedStepId ? "true" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(step.stepId);
            }}
          >
            {step.title || step.stepId}
          </button>
          {!isRequiredStep(step.stepId) && (
            <span className={styles.stepRowActions}>
              <button
                type="button"
                className={styles.railIconBtn}
                title="Move up"
                disabled={index === 0}
                onClick={(e) => { e.stopPropagation(); onMoveUp(index); }}
              >
                <ArrowUp01Icon size={14} />
              </button>
              <button
                type="button"
                className={styles.railIconBtn}
                title="Move down"
                disabled={index === editableCount - 1}
                onClick={(e) => { e.stopPropagation(); onMoveDown(index); }}
              >
                <ArrowDown01Icon size={14} />
              </button>
              <button
                type="button"
                className={styles.railIconBtn}
                title="Delete"
                onClick={(e) => { e.stopPropagation(); handleRemove(step.stepId); }}
              >
                <Cancel01Icon size={13} />
              </button>
            </span>
          )}
        </div>
      ))}
      <button type="button" onClick={onAdd} className={styles.stepListAddButton}>
        + Add Step
      </button>

      <div className={styles.railTitle}>Form</div>
      {/* Form-level contact details live beside the steps, not inside one.
          No nested controls here, so the whole row can be the button. */}
      <button
        type="button"
        className={`${styles.stepRow} ${styles.stepRowButton} ${isContactDetailsActive ? styles.stepRowActive : ""}`}
        aria-current={isContactDetailsActive ? "true" : undefined}
        onClick={onSelectContactDetails}
      >
        <span className={styles.stepRowTitle}>
          Contact Details {hasContactDetails ? "✓" : "(none)"}
        </span>
      </button>

      {/* Form-level processors live beside the steps, not inside one. */}
      <button
        type="button"
        className={`${styles.stepRow} ${styles.stepRowButton} ${isProcessorsActive ? styles.stepRowActive : ""}`}
        aria-current={isProcessorsActive ? "true" : undefined}
        onClick={onSelectProcessors}
      >
        <span className={styles.stepRowTitle}>
          Processors ({processorCount})
        </span>
      </button>
    </div>
  );
}
