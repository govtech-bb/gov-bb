import { BEHAVIOUR_TYPE_DESCRIPTORS } from "@govtech-bb/form-builder";
import type { Behaviour } from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { FieldRefPicker } from "./-field-ref-picker";
import styles from "../../styles/builder.module.css";

interface BehavioursEditorProps {
  scope: "field" | "step";
  behaviours: Behaviour[];
  fieldRefs: FieldRef[];
  stepRefs: StepRef[];
  onChange: (behaviours: Behaviour[]) => void;
  // The step the edited entity lives in. For field behaviours this seeds a new
  // fieldConditionalOn's Target Step so the common "same step" case needs no
  // extra click. Step behaviours pass nothing (the target step is open). (#519)
  currentStepId?: string;
}

const OPERATOR_OPTIONS = ["equal", "notEqual", "in", "exists"] as const;

export function BehavioursEditor({
  scope,
  behaviours,
  fieldRefs,
  stepRefs,
  onChange,
  currentStepId,
}: BehavioursEditorProps) {
  const available = BEHAVIOUR_TYPE_DESCRIPTORS.filter(
    (d) => d.scopes.includes(scope) && !behaviours.some((b) => b.type === d.type),
  );

  function handleAdd(bType: string) {
    const descriptor = BEHAVIOUR_TYPE_DESCRIPTORS.find((d) => d.type === bType);
    if (!descriptor) return;
    const newBehaviour: Record<string, unknown> = { type: bType };
    for (const param of descriptor.params) {
      if (param.kind === "stepRef") {
        // Default the Target Step to the current step; step-scoped behaviours
        // (currentStepId undefined) stay empty so the field picker is gated.
        newBehaviour[param.name] = currentStepId ?? "";
      } else if (param.kind === "fieldRef" || param.kind === "value") {
        newBehaviour[param.name] = "";
      } else if (param.kind === "operator") {
        newBehaviour[param.name] = "equal";
      } else if (param.kind === "number") {
        newBehaviour[param.name] = 0;
      } else if (param.kind === "stringArray") {
        newBehaviour[param.name] = [];
      }
    }
    onChange([...behaviours, newBehaviour as unknown as Behaviour]);
  }

  function handleDelete(index: number) {
    onChange(behaviours.filter((_, i) => i !== index));
  }

  function handleParamChange(index: number, paramName: string, value: unknown) {
    const updated = behaviours.map((b, i) => {
      if (i !== index) return b;
      const descriptor = BEHAVIOUR_TYPE_DESCRIPTORS.find((d) => d.type === b.type);
      const next = { ...b, [paramName]: value } as Record<string, unknown>;
      // Changing the Target Step invalidates a Target Field that no longer
      // belongs to it — clear the stale selection so it can't be saved. (#519)
      const stepParam = descriptor?.params.find((p) => p.kind === "stepRef");
      const fieldParam = descriptor?.params.find((p) => p.kind === "fieldRef");
      if (stepParam && fieldParam && paramName === stepParam.name) {
        const validIds = fieldRefs
          .filter((f) => f.stepId === value)
          .map((f) => f.fieldId);
        const current = next[fieldParam.name];
        if (current && !validIds.includes(current as string)) {
          next[fieldParam.name] = "";
        }
      }
      return next as unknown as Behaviour;
    });
    onChange(updated);
  }

  return (
    <div>
      {behaviours.map((behaviour, index) => {
        const descriptor = BEHAVIOUR_TYPE_DESCRIPTORS.find((d) => d.type === behaviour.type);
        const stepParam = descriptor?.params.find((p) => p.kind === "stepRef");
        return (
          <div key={behaviour.type} className={styles.fieldRow} style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
              <strong>{descriptor?.label ?? behaviour.type}</strong>
              <button type="button" onClick={() => handleDelete(index)}>×</button>
            </div>
            {descriptor?.params.map((param) => {
              const bRecord = behaviour as Record<string, unknown>;
              if (param.kind === "fieldRef") {
                // Scope the field picker to the behaviour's selected Target
                // Step, and disable it until a step is chosen. (#519)
                const selectedStepId = stepParam
                  ? ((bRecord[stepParam.name] as string) ?? "")
                  : "";
                const scopedRefs = selectedStepId
                  ? fieldRefs.filter((f) => f.stepId === selectedStepId)
                  : [];
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    <FieldRefPicker
                      value={(bRecord[param.name] as string) ?? ""}
                      fieldRefs={scopedRefs}
                      disabled={!selectedStepId}
                      onChange={(val) => handleParamChange(index, param.name, val)}
                    />
                  </div>
                );
              }
              if (param.kind === "stepRef") {
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    <select
                      value={(bRecord[param.name] as string) ?? ""}
                      onChange={(e) => handleParamChange(index, param.name, e.target.value)}
                    >
                      <option value="">— select step —</option>
                      {stepRefs.map((s) => (
                        <option key={s.stepId} value={s.stepId}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }
              if (param.kind === "operator") {
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    <select
                      value={(bRecord[param.name] as string) ?? "equal"}
                      onChange={(e) => handleParamChange(index, param.name, e.target.value)}
                    >
                      {OPERATOR_OPTIONS.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>
                );
              }
              if (param.kind === "number") {
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    <input
                      type="number"
                      value={(bRecord[param.name] as number) ?? 0}
                      onChange={(e) =>
                        handleParamChange(index, param.name, parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                );
              }
              if (param.kind === "value") {
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    <input
                      type="text"
                      value={(bRecord[param.name] as string) ?? ""}
                      onChange={(e) => handleParamChange(index, param.name, e.target.value)}
                    />
                  </div>
                );
              }
              if (param.kind === "stringArray") {
                const arr = (bRecord[param.name] as string[]) ?? [];
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label} (comma-separated)</label>
                    <input
                      type="text"
                      value={arr.join(", ")}
                      onChange={(e) =>
                        handleParamChange(
                          index,
                          param.name,
                          e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        )
                      }
                    />
                  </div>
                );
              }
              return null;
            })}
          </div>
        );
      })}
      {available.length > 0 && (
        <div>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleAdd(e.target.value);
            }}
          >
            <option value="">+ Add Behaviour</option>
            {available.map((d) => (
              <option key={d.type} value={d.type}>{d.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
