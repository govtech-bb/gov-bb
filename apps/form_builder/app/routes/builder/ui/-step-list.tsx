import type { RecipeStepDraft } from "@govtech-bb/form-builder";
import styles from "../../../styles/builder.module.css";
import { isRequiredStep, REQUIRED_STEP_IDS } from "./-recipe-reducer";

interface StepListProps {
  steps: RecipeStepDraft[];
  selectedStepId: string | null;
  onSelect: (stepId: string) => void;
  onAdd: () => void;
  onRemove: (stepId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onSwitchToAi: () => void;
  processorCount: number;
  isProcessorsActive: boolean;
  onSelectProcessors: () => void;
}

export function StepList({
  steps,
  selectedStepId,
  onSelect,
  onAdd,
  onRemove,
  onMoveUp,
  onMoveDown,
  onSwitchToAi,
  processorCount,
  isProcessorsActive,
  onSelectProcessors,
}: StepListProps) {
  const editableCount = steps.length - REQUIRED_STEP_IDS.length;

  function handleRemove(stepId: string) {
    if (!window.confirm("Delete this step?")) return;
    onRemove(stepId);
  }

  return (
    <div className={styles.stepList}>
      <button
        type="button"
        onClick={onSwitchToAi}
        className={styles.btnSwitch}
        style={{ width: "100%", marginBottom: "8px" }}
      >
        Switch to AI Builder
      </button>
      <button type="button" onClick={onAdd} className={styles.stepListAddButton}>+ Add Step</button>
      {steps.map((step, index) => (
        <div
          key={step.stepId}
          className={`${styles.stepRow} ${step.stepId === selectedStepId ? styles.stepRowActive : ""}`}
          onClick={() => onSelect(step.stepId)}
        >
          <span style={{ flex: 1, fontSize: "0.9rem" }}>{step.title || step.stepId}</span>
          {!isRequiredStep(step.stepId) && (
            <>
              <button
                type="button"
                title="Move up"
                disabled={index === 0}
                onClick={(e) => { e.stopPropagation(); onMoveUp(index); }}
              >
                ▲
              </button>
              <button
                type="button"
                title="Move down"
                disabled={index === editableCount - 1}
                onClick={(e) => { e.stopPropagation(); onMoveDown(index); }}
              >
                ▼
              </button>
              <button
                type="button"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); handleRemove(step.stepId); }}
              >
                ×
              </button>
            </>
          )}
        </div>
      ))}

      {/* Form-level processors live beside the steps, not inside one. */}
      <div
        className={`${styles.stepRow} ${styles.processorsRow} ${isProcessorsActive ? styles.stepRowActive : ""}`}
        onClick={onSelectProcessors}
      >
        <span style={{ flex: 1, fontSize: "0.9rem" }}>
          Processors ({processorCount})
        </span>
      </div>
    </div>
  );
}
