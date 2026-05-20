import { useState } from "react";
import { getRegistryItem } from "@govtech-bb/form-builder";
import type { RecipeFieldDraft, RegistryCatalog, ChildOverrides, BlockDefinition } from "@govtech-bb/form-builder";
import type { FieldOverrides, HtmlTypes } from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { ValidationRulesEditor } from "./-validation-rules-editor";
import { BehavioursEditor } from "./-behaviours-editor";
import styles from "../../styles/builder.module.css";

interface FieldEditPanelProps {
  field: RecipeFieldDraft;
  catalog: RegistryCatalog;
  fieldRefs: FieldRef[];
  stepRefs: StepRef[];
  onSave: (overrides: FieldOverrides, childOverrides?: ChildOverrides) => void;
  onClose: () => void;
}

interface OverrideFormProps {
  overrides: FieldOverrides;
  htmlType: HtmlTypes;
  fieldRefs: FieldRef[];
  stepRefs: StepRef[];
  onChange: (overrides: FieldOverrides) => void;
}

function OverrideForm({ overrides, htmlType, fieldRefs, stepRefs, onChange }: OverrideFormProps) {
  function patch(partial: Partial<FieldOverrides>) {
    onChange({ ...overrides, ...partial });
  }

  return (
    <div>
      <div className={styles.formGroup}>
        <label>Label</label>
        <input
          type="text"
          value={overrides.label ?? ""}
          onChange={(e) => patch({ label: e.target.value || undefined })}
        />
      </div>
      <div className={styles.formGroup}>
        <label>Hint</label>
        <input
          type="text"
          value={overrides.hint ?? ""}
          onChange={(e) => patch({ hint: e.target.value || undefined })}
        />
      </div>
      <div className={styles.formGroup}>
        <label>
          <input
            type="checkbox"
            checked={overrides.isDisabled ?? false}
            onChange={(e) => patch({ isDisabled: e.target.checked || undefined })}
          />
          {" "}Disabled
        </label>
      </div>
      <div className={styles.formGroup}>
        <label>
          <input
            type="checkbox"
            checked={overrides.isHidden ?? false}
            onChange={(e) => patch({ isHidden: e.target.checked || undefined })}
          />
          {" "}Hidden
        </label>
      </div>

      <div className={styles.sectionTitle}>Validation Rules</div>
      <ValidationRulesEditor
        htmlType={htmlType}
        rules={overrides.validations}
        fieldRefs={fieldRefs}
        onChange={(validations) => patch({ validations })}
      />

      <div className={styles.sectionTitle}>Field Behaviours</div>
      <BehavioursEditor
        scope="field"
        behaviours={overrides.behaviours ?? []}
        fieldRefs={fieldRefs}
        stepRefs={stepRefs}
        onChange={(behaviours) => patch({ behaviours: behaviours.length > 0 ? behaviours : undefined })}
      />
    </div>
  );
}

export function FieldEditPanel({
  field,
  catalog,
  fieldRefs,
  stepRefs,
  onSave,
  onClose,
}: FieldEditPanelProps) {
  const item = getRegistryItem(field.ref, catalog);

  // Determine htmlType for component/custom fields
  const htmlType: HtmlTypes = (() => {
    if (!item) return "text";
    if ("primitive" in item) return item.primitive.htmlType;
    // For blocks, we'll handle per-child
    return "text";
  })();

  const [overrides, setOverrides] = useState<FieldOverrides>({ ...field.overrides });
  const [childOverrides, setChildOverrides] = useState<ChildOverrides>(
    field.childOverrides ? { ...field.childOverrides } : {},
  );

  function handleSave() {
    if (field.kind === "block") {
      onSave(overrides, childOverrides);
    } else {
      onSave(overrides);
    }
    onClose();
  }

  function handleChildOverrideChange(childFieldId: string, childOverride: FieldOverrides) {
    setChildOverrides((prev) => ({ ...prev, [childFieldId]: childOverride }));
  }

  const isBlock = field.kind === "block" && item && "block" in item;
  const blockDef = isBlock ? (item as BlockDefinition) : null;

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <strong>Edit Field: {item?.displayName ?? field.ref}</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        {isBlock && blockDef ? (
          <div>
            {blockDef.block.elements.map((element) => {
              const childHtmlType: HtmlTypes = element.htmlType;
              const childOverride = childOverrides[element.fieldId] ?? {};
              return (
                <div key={element.fieldId} style={{ marginBottom: 16, border: "1px solid #eee", padding: 12, borderRadius: 4 }}>
                  <div className={styles.sectionTitle}>{element.label} ({element.fieldId})</div>
                  <OverrideForm
                    overrides={childOverride}
                    htmlType={childHtmlType}
                    fieldRefs={fieldRefs}
                    stepRefs={stepRefs}
                    onChange={(updated) => handleChildOverrideChange(element.fieldId, updated)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <OverrideForm
            overrides={overrides}
            htmlType={htmlType}
            fieldRefs={fieldRefs}
            stepRefs={stepRefs}
            onChange={setOverrides}
          />
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button type="button" onClick={handleSave}>Save</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
