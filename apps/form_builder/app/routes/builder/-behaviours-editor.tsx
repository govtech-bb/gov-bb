import { useState } from "react";
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
  // extra click (#519). For step behaviours it scopes the fieldRefArray
  // checkbox list (sharedFields.fieldIds) to the step's own fields (#792) —
  // it never seeds a step-scope Target Step.
  currentStepId?: string;
}

const OPERATOR_OPTIONS = [
  "equal",
  "notEqual",
  "in",
  "exists",
  // Numeric comparison operators (#1020). A range is two stacked conditions
  // (gte + lte) — the runtime ANDs them.
  "gte",
  "lte",
  "gt",
  "lt",
] as const;

// Operators that compare numbers — the only ones for which a date→number
// `transform` is meaningful, so the transform selector is gated on them.
const NUMERIC_OPERATORS = new Set(["gte", "lte", "gt", "lt"]);

const TRANSFORM_OPTIONS = ["yearsSince", "monthsSince", "daysSince"] as const;

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

// Value control for the `in` operator, whose evaluator is array-only. A local
// text buffer keeps the raw typed string (commas and all) visible while the
// user edits; the normalized `string[]` is committed on blur. Deriving the
// displayed value straight from the stored array instead would strip a
// trailing comma on every keystroke, making a second value impossible to
// type. (#1738)
function InValueInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: unknown;
  onCommit: (next: string[]) => void;
}) {
  const [text, setText] = useState(
    Array.isArray(value)
      ? value.join(", ")
      : ((value as string | undefined) ?? ""),
  );
  return (
    <div className={styles.formGroup}>
      <label>{label}</label>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onCommit(
            text
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
      <small className={styles.fieldHint}>
        Enter multiple values separated by commas
      </small>
    </div>
  );
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
    (d) =>
      d.scopes.includes(scope) && !behaviours.some((b) => b.type === d.type),
  );

  function handleAdd(bType: string) {
    const descriptor = BEHAVIOUR_TYPE_DESCRIPTORS.find((d) => d.type === bType);
    if (!descriptor) return;
    const newBehaviour: Record<string, unknown> = { type: bType };
    for (const param of descriptor.params) {
      if (param.kind === "stepRef") {
        // Default the Target Step to the current step for field behaviours
        // only; step scope (which now also receives currentStepId for the
        // fieldRefArray list) stays empty so the field picker is gated and
        // stepConditionalOn can't target its own step by default. (#519)
        newBehaviour[param.name] =
          scope === "field" ? (currentStepId ?? "") : "";
      } else if (param.kind === "fieldRef" || param.kind === "value") {
        newBehaviour[param.name] = "";
      } else if (param.kind === "operator") {
        newBehaviour[param.name] = "equal";
      } else if (param.kind === "number") {
        newBehaviour[param.name] = param.defaultValue ?? 0;
      } else if (param.kind === "fieldRefArray") {
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
      const descriptor = BEHAVIOUR_TYPE_DESCRIPTORS.find(
        (d) => d.type === b.type,
      );
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
        const targetIsBoolean = targetFieldIsBoolean(
          next,
          descriptor,
          fieldRefs,
        );
        const valueIsBoolean = typeof next[valueParam.name] === "boolean";
        if (targetIsBoolean !== valueIsBoolean) {
          next[valueParam.name] = targetIsBoolean ? true : "";
        }
      }
      // Switching to a non-numeric operator strips any stale transform. The
      // editor only exposes the transform control for numeric operators, so a
      // leftover transform would otherwise silently derive a value at runtime
      // with no visible control to clear it. (#1020)
      const operatorParam = descriptor?.params.find(
        (p) => p.kind === "operator",
      );
      if (
        operatorParam &&
        paramName === operatorParam.name &&
        !NUMERIC_OPERATORS.has(value as string)
      ) {
        delete next.transform;
      }
      // Reshape the value when the operator switches to/from `in`: the `in`
      // evaluator is array-only, every other operator scalar. Boolean targets
      // keep their boolean (the `in` control is never shown for them). (#1738)
      if (
        operatorParam &&
        valueParam &&
        paramName === operatorParam.name &&
        !targetFieldIsBoolean(next, descriptor, fieldRefs)
      ) {
        const current = next[valueParam.name];
        if (value === "in" && !Array.isArray(current)) {
          next[valueParam.name] =
            current === undefined || current === null || current === ""
              ? []
              : [String(current)];
        } else if (value !== "in" && Array.isArray(current)) {
          next[valueParam.name] = (current as string[]).join(", ");
        }
      }
      // When a number param changes, raise any sibling number param whose
      // `atLeastParam` points at this one and is now below it. Mirrors the
      // #519/#565 sibling-invalidation pattern above. (#771)
      if (descriptor && typeof value === "number") {
        for (const sibling of descriptor.params) {
          if (
            sibling.kind === "number" &&
            sibling.atLeastParam === paramName &&
            typeof next[sibling.name] === "number" &&
            (next[sibling.name] as number) < value
          ) {
            next[sibling.name] = value;
          }
        }
      }
      return next as unknown as Behaviour;
    });
    onChange(updated);
  }

  return (
    <div>
      {behaviours.map((behaviour, index) => {
        const descriptor = BEHAVIOUR_TYPE_DESCRIPTORS.find(
          (d) => d.type === behaviour.type,
        );
        const stepParam = descriptor?.params.find((p) => p.kind === "stepRef");
        return (
          <div
            key={behaviour.type}
            className={styles.fieldRow}
            style={{ flexDirection: "column", alignItems: "flex-start" }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                width: "100%",
              }}
            >
              <strong>{descriptor?.label ?? behaviour.type}</strong>
              <button type="button" onClick={() => handleDelete(index)}>
                ×
              </button>
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
                      onChange={(val) =>
                        handleParamChange(index, param.name, val)
                      }
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
                      onChange={(e) =>
                        handleParamChange(index, param.name, e.target.value)
                      }
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
                      onChange={(e) =>
                        handleParamChange(index, param.name, e.target.value)
                      }
                    >
                      {OPERATOR_OPTIONS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }
              if (param.kind === "transform") {
                // Only meaningful for a numeric operator (it derives a number
                // from a date before the comparison). Hidden otherwise so the
                // control can't be set against equal/in/exists. (#1020)
                const operator = bRecord["operator"] as string | undefined;
                if (!operator || !NUMERIC_OPERATORS.has(operator)) return null;
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    <select
                      value={(bRecord[param.name] as string) ?? ""}
                      onChange={(e) =>
                        handleParamChange(
                          index,
                          param.name,
                          e.target.value === "" ? undefined : e.target.value,
                        )
                      }
                    >
                      <option value="">— none —</option>
                      {TRANSFORM_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
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
                      min={param.minValue}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        const atLeastValue =
                          param.atLeastParam != null
                            ? ((bRecord[param.atLeastParam] as
                                | number
                                | undefined) ?? -Infinity)
                            : -Infinity;
                        const floor = Math.max(
                          param.minValue ?? -Infinity,
                          atLeastValue,
                        );
                        handleParamChange(
                          index,
                          param.name,
                          Math.max(floor, isNaN(parsed) ? 0 : parsed),
                        );
                      }}
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
                // `in` target ⇒ comma-separated entry stored as a string[],
                // since the `in` evaluator is array-only. Entry is buffered and
                // committed on blur (see InValueInput). (#1738)
                if ((bRecord["operator"] as string | undefined) === "in") {
                  // Key on the stored value so a committed change remounts the
                  // input — re-seeding its local buffer from the canonical array
                  // (normalizes display, avoids a stale buffer). Prefixed with
                  // the param name so a typed value can't collide with a sibling
                  // control's key. (#1738)
                  return (
                    <InValueInput
                      key={`${param.name}:${String(bRecord[param.name])}`}
                      label={param.label}
                      value={bRecord[param.name]}
                      onCommit={(next) =>
                        handleParamChange(index, param.name, next)
                      }
                    />
                  );
                }
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    <input
                      type="text"
                      value={(bRecord[param.name] as string) ?? ""}
                      onChange={(e) =>
                        handleParamChange(index, param.name, e.target.value)
                      }
                    />
                  </div>
                );
              }
              if (param.kind === "fieldRefArray") {
                // Checkbox per current-step field, so resolved field ids are
                // picked rather than typed. Two same-type fields on one step
                // resolve to the same runtime id, so dedupe by fieldId. (#792)
                const selected = (bRecord[param.name] as string[]) ?? [];
                const stepFields = fieldRefs.filter(
                  (f) => f.stepId === currentStepId,
                );
                const options = stepFields.filter(
                  (f, i) =>
                    stepFields.findIndex((o) => o.fieldId === f.fieldId) === i,
                );
                if (options.length === 0) {
                  return (
                    <div key={param.name} className={styles.formGroup}>
                      <label>{param.label}</label>
                      <em>This step has no fields yet.</em>
                    </div>
                  );
                }
                const validIds = options.map((o) => o.fieldId);
                return (
                  <div key={param.name} className={styles.formGroup}>
                    <label>{param.label}</label>
                    {options.map((f) => {
                      const checked = selected.includes(f.fieldId);
                      return (
                        <label key={f.fieldId}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              // Rebuild from real fields only — a stale
                              // hand-typed id silently drops on the next edit.
                              const next = checked
                                ? selected.filter((id) => id !== f.fieldId)
                                : [...selected, f.fieldId];
                              handleParamChange(
                                index,
                                param.name,
                                next.filter((id) => validIds.includes(id)),
                              );
                            }}
                          />
                          {f.displayName}
                        </label>
                      );
                    })}
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
                          e.target.value.trim() === ""
                            ? undefined
                            : e.target.value,
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
              <option key={d.type} value={d.type}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
