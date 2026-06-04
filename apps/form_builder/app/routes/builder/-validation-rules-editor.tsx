import { VALIDATION_RULE_DESCRIPTORS } from "@govtech-bb/form-builder";
import type {
  HtmlTypes,
  FieldOverrides,
  ValidationType,
  ValidationConfig,
  ValidationRule,
} from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { FieldRefPicker } from "./-field-ref-picker";
import styles from "../../styles/builder.module.css";

interface ValidationRulesEditorProps {
  htmlType: HtmlTypes;
  rules: FieldOverrides["validations"];
  // Validations declared on the base component/primitive. Surfaced as read-only
  // "inherited" rows the author can override per field instance (#618).
  baseRules?: ValidationRule;
  fieldRefs: FieldRef[];
  // Steps available as reference-rule scopes. Mirrors the behaviours editor's
  // Target Step pattern, but unscoped (no targetStepId) stays fully editable
  // for backward compatibility with existing reference rules (#840).
  stepRefs: StepRef[];
  onChange: (rules: FieldOverrides["validations"]) => void;
}

// `required` is owned by the dedicated Required checkbox (which reads the base
// via `defaultRequired` and writes the off-sentinel). Excluding it here avoids
// a double control (#618).
const isManaged = (type: ValidationType) => type !== "required";

export function ValidationRulesEditor({
  htmlType,
  rules,
  baseRules,
  fieldRefs,
  stepRefs,
  onChange,
}: ValidationRulesEditorProps) {
  const descriptors = VALIDATION_RULE_DESCRIPTORS[htmlType] ?? [];
  const overrideRules = rules ?? {};
  const base = baseRules ?? {};

  const baseTypes = (Object.keys(base) as ValidationType[]).filter(isManaged);
  const overrideTypes = (Object.keys(overrideRules) as ValidationType[]).filter(
    isManaged,
  );
  // Union: inherited (base) rules first, then any author-added override-only
  // rules. A rule that is both base and overridden appears once, as overridden.
  const ruleTypes = [
    ...baseTypes,
    ...overrideTypes.filter((type) => !baseTypes.includes(type)),
  ];
  // A rule that is inherited or already present can't be re-added from scratch —
  // inherited ones are reached via Override, not the Add dropdown.
  const available = descriptors.filter(
    (d) => isManaged(d.type) && !ruleTypes.includes(d.type),
  );

  // Write only genuine deltas: an empty override set collapses to `undefined`
  // so the recipe never carries a non-delta `{}` (ADR 0013/0014/0024).
  function commit(next: ValidationRule) {
    onChange(Object.keys(next).length > 0 ? next : undefined);
  }

  function handleAdd(ruleType: ValidationType) {
    commit({ ...overrideRules, [ruleType]: {} as ValidationConfig });
  }

  // Used by both author-added delete (×) and overridden Reset: drop the key,
  // falling back to the inherited base (if any).
  function removeRule(ruleType: ValidationType) {
    const next = { ...overrideRules };
    delete next[ruleType];
    commit(next);
  }

  // Promote an inherited rule to an editable override, seeded from the base.
  function handleOverride(ruleType: ValidationType) {
    commit({ ...overrideRules, [ruleType]: { ...base[ruleType] } });
  }

  function handleUpdate(
    ruleType: ValidationType,
    patch: Partial<ValidationConfig>,
  ) {
    const existing = overrideRules[ruleType] ?? {};
    const merged = { ...existing, ...patch } as Record<string, unknown>;
    // A patched key set to `undefined` is a genuine deletion, not a stored
    // `undefined`: strip it so the committed config never owns the key (e.g.
    // clearing the Reference Step removes targetStepId entirely). ADR 0013/0014.
    for (const key of Object.keys(patch)) {
      if ((patch as Record<string, unknown>)[key] === undefined) {
        delete merged[key];
      }
    }
    commit({ ...overrideRules, [ruleType]: merged as ValidationConfig });
  }

  // Changing the Reference Step revalidates the Reference Field: a field that no
  // longer belongs to the newly scoped step is cleared in the same update so a
  // stale id can't be saved. Clearing the step (empty value) removes
  // targetStepId entirely and falls back to the flat field list. (#840, #519)
  function handleStepChange(ruleType: ValidationType, stepId: string) {
    const existing = overrideRules[ruleType] ?? {};
    const patch: Partial<ValidationConfig> = {
      // undefined => handleUpdate strips the key (genuine delta).
      targetStepId: stepId === "" ? undefined : stepId,
    };
    if (stepId !== "" && existing.referenceFieldId) {
      const validIds = fieldRefs
        .filter((f) => f.stepId === stepId)
        .map((f) => f.fieldId);
      if (!validIds.includes(existing.referenceFieldId)) {
        patch.referenceFieldId = "";
      }
    }
    handleUpdate(ruleType, patch);
  }

  return (
    <div>
      {ruleTypes.map((ruleType) => {
        const descriptor = descriptors.find((d) => d.type === ruleType);
        const label = descriptor?.label ?? ruleType;
        const isOverridden = ruleType in overrideRules;
        const hasBase = ruleType in base;

        // Inherited: base-only rule shown read-only with an Override action.
        if (!isOverridden) {
          const config = base[ruleType] ?? {};
          return (
            <div
              key={ruleType}
              className={`${styles.fieldRow} ${styles.inheritedRow}`}
              style={{ flexDirection: "column", alignItems: "flex-start" }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>{label}</strong>
                <span className={styles.inheritedTag}>
                  Inherited from component
                </span>
                <button type="button" onClick={() => handleOverride(ruleType)}>
                  Override
                </button>
              </div>
              {descriptor?.hasValue && config.value != null && (
                <div className={styles.formGroup}>
                  <label>Value</label>
                  <span>{String(config.value)}</span>
                </div>
              )}
              {config.error && (
                <div className={styles.formGroup}>
                  <label>Error Message</label>
                  <span>{config.error}</span>
                </div>
              )}
            </div>
          );
        }

        // Editable: an override exists. With a base counterpart it's an override
        // of an inherited rule (Reset returns to base); without one it's an
        // author-added rule (× deletes it). Overridden rows reuse the standard
        // override highlight.
        const config = overrideRules[ruleType] ?? {};
        return (
          <div
            key={ruleType}
            className={`${styles.fieldRow} ${hasBase ? styles.overrideField : ""}`}
            style={{ flexDirection: "column", alignItems: "flex-start" }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <strong>{label}</strong>
              <button type="button" onClick={() => removeRule(ruleType)}>
                {hasBase ? "Reset" : "×"}
              </button>
            </div>
            {descriptor?.hasValue && (
              <div className={styles.formGroup}>
                <label>Value</label>
                <input
                  type="text"
                  placeholder={descriptor?.valuePlaceholder}
                  value={(config.value as string) ?? ""}
                  onChange={(e) =>
                    handleUpdate(ruleType, { value: e.target.value })
                  }
                />
              </div>
            )}
            {descriptor?.hasReference &&
              (() => {
                const targetStepId = config.targetStepId ?? "";
                // Unscoped (no step): show the full flat field list and stay
                // enabled — existing recipes have reference rules with no
                // targetStepId and must remain fully editable. Scoped: filter
                // the field list to the selected step. (#840)
                const scopedRefs = targetStepId
                  ? fieldRefs.filter((f) => f.stepId === targetStepId)
                  : fieldRefs;
                return (
                  <>
                    <div className={styles.formGroup}>
                      <label>Reference Step</label>
                      <select
                        value={targetStepId}
                        onChange={(e) =>
                          handleStepChange(ruleType, e.target.value)
                        }
                      >
                        <option value="">— any step —</option>
                        {stepRefs.map((s) => (
                          <option key={s.stepId} value={s.stepId}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Reference Field</label>
                      <FieldRefPicker
                        value={config.referenceFieldId ?? ""}
                        fieldRefs={scopedRefs}
                        onChange={(val) =>
                          handleUpdate(ruleType, { referenceFieldId: val })
                        }
                      />
                    </div>
                  </>
                );
              })()}
            <div className={styles.formGroup}>
              <label>Error Message</label>
              <input
                type="text"
                value={config.error ?? ""}
                onChange={(e) =>
                  handleUpdate(ruleType, { error: e.target.value })
                }
              />
            </div>
          </div>
        );
      })}
      {available.length > 0 && (
        <div>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleAdd(e.target.value as ValidationType);
            }}
          >
            <option value="">+ Add Rule</option>
            {available.map((d) => (
              <option key={d.type} value={d.type}>{d.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
