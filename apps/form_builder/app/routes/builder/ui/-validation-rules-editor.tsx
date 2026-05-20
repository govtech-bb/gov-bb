import { VALIDATION_RULE_DESCRIPTORS } from "@govtech-bb/form-builder";
import type { HtmlTypes, FieldOverrides, ValidationType, ValidationConfig } from "@govtech-bb/form-types";
import type { FieldRef } from "./-recipe-refs";
import { FieldRefPicker } from "./-field-ref-picker";
import styles from "../../../styles/builder.module.css";

interface ValidationRulesEditorProps {
  htmlType: HtmlTypes;
  rules: FieldOverrides["validations"];
  fieldRefs: FieldRef[];
  onChange: (rules: FieldOverrides["validations"]) => void;
}

export function ValidationRulesEditor({
  htmlType,
  rules,
  fieldRefs,
  onChange,
}: ValidationRulesEditorProps) {
  const descriptors = VALIDATION_RULE_DESCRIPTORS[htmlType] ?? [];
  const appliedTypes = rules ? (Object.keys(rules) as ValidationType[]) : [];
  const available = descriptors.filter((d) => !appliedTypes.includes(d.type));

  function handleAdd(ruleType: ValidationType) {
    const newRules = { ...rules, [ruleType]: {} as ValidationConfig };
    onChange(newRules);
  }

  function handleDelete(ruleType: ValidationType) {
    if (!rules) return;
    const newRules = { ...rules };
    delete newRules[ruleType];
    onChange(newRules);
  }

  function handleUpdate(ruleType: ValidationType, patch: Partial<ValidationConfig>) {
    const existing = rules?.[ruleType] ?? {};
    onChange({ ...rules, [ruleType]: { ...existing, ...patch } });
  }

  return (
    <div>
      {appliedTypes.map((ruleType) => {
        const descriptor = descriptors.find((d) => d.type === ruleType);
        const config = rules?.[ruleType] ?? {};
        return (
          <div key={ruleType} className={styles.fieldRow} style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <strong>{descriptor?.label ?? ruleType}</strong>
              <button type="button" onClick={() => handleDelete(ruleType)}>×</button>
            </div>
            {descriptor?.hasValue && (
              <div className={styles.formGroup}>
                <label>Value</label>
                <input
                  type="text"
                  value={(config.value as string) ?? ""}
                  onChange={(e) => handleUpdate(ruleType, { value: e.target.value })}
                />
              </div>
            )}
            {descriptor?.hasReference && (
              <div className={styles.formGroup}>
                <label>Reference Field</label>
                <FieldRefPicker
                  value={config.referenceFieldId ?? ""}
                  fieldRefs={fieldRefs}
                  onChange={(val) => handleUpdate(ruleType, { referenceFieldId: val })}
                />
              </div>
            )}
            <div className={styles.formGroup}>
              <label>Error Message</label>
              <input
                type="text"
                value={config.error ?? ""}
                onChange={(e) => handleUpdate(ruleType, { error: e.target.value })}
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
