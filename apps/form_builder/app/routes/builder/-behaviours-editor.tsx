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

type BehaviourDescriptor = (typeof BEHAVIOUR_TYPE_DESCRIPTORS)[number];

// Resolve whether a conditional's selected Target Field is a boolean field
// (checkbox / show-hide), matched on step + resolved field id. Drives the
// type-aware condition value control. (#565)
function targetFieldIsBoolean(
  record: Record<string, unknown>,
  descriptor: BehaviourDescriptor | undefined,
  fieldRefs: FieldRef[],
): boolean {
  const stepParam = descriptor?.params.find((p) => p.kind === "stepRef");
  const fieldParam = descriptor?.params.find((p) => p.kind === "fieldRef");
  if (!fieldParam) return false;
  const fieldId = record[fieldParam.name];
  if (!fieldId) return false;
  const stepId = stepParam ? record[stepParam.name] : undefined;
  const ref = fieldRefs.find(
    (f) => f.fieldId === fieldId && (stepId == null || f.stepId === stepId),
  );
  return ref?.isBoolean ?? false;
}

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
      } else if (param.kind === "text" && !param.optional) {
        // Required text params seed ""; optional ones (excluded above) stay
        // absent so runtime fallbacks (e.g. addAnotherLabel ?? "Add
        // another?") keep applying.
        newBehaviour[param.name] = "";
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
      const next = { ...b } as Record<string, unknown>;
      if (value === undefined) {
        // Blanked optional text param: remove the key entirely (storing "" or
        // undefined would still ship the key in the recipe).
        delete next[paramName];
      } else {
        next[paramName] = value;
      }
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
      // When the resolved Target Field's boolean-ness changes (because the step
      // or field changed), reset the condition value to a type-appropriate
      // default — boolean targets to `true`, others to "" — so a stale string
      // can't be saved against a boolean target. Mirrors the #519 invalidation.
      const valueParam = descriptor?.params.find((p) => p.kind === "value");
      if (
        valueParam &&
        fieldParam &&
        (paramName === fieldParam.name || paramName === stepParam?.name)
      ) {
        const targetIsBoolean = targetFieldIsBoolean(next, descriptor, fieldRefs);
        const valueIsBoolean = typeof next[valueParam.name] === "boolean";
        if (targetIsBoolean !== valueIsBoolean) {
          next[valueParam.name] = targetIsBoolean ? true : "";
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
                // Boolean target ⇒ a true/false select storing a real boolean,
                // so "equals true/false" against a checkbox actually fires at
                // runtime. Any other target keeps the free-text input. (#565)
                if (targetFieldIsBoolean(bRecord, descriptor, fieldRefs)) {
                  const raw = bRecord[param.name];
                  const boolValue = typeof raw === "boolean" ? raw : true;
                  return (
                    <div key={param.name} className={styles.formGroup}>
                      <label>{param.label}</label>
                      <select
                        value={String(boolValue)}
                        onChange={(e) =>
                          handleParamChange(
                            index,
                            param.name,
                            e.target.value === "true",
                          )
                        }
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    </div>
                  );
                }
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
              if (param.kind === "text") {
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    <input
                      type="text"
                      placeholder={param.placeholder}
                      value={(bRecord[param.name] as string) ?? ""}
                      onChange={(e) =>
                        handleParamChange(
                          index,
                          param.name,
                          e.target.value.trim() === "" ? undefined : e.target.value,
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
