import { useState, useMemo } from "react";
import { getRegistryItem, fieldIdDuplicatesAnother } from "@govtech-bb/form-builder";
import type {
  RecipeFieldDraft,
  RegistryCatalog,
  ChildOverrides,
  BlockDefinition,
  RecipeDraft,
} from "@govtech-bb/form-builder";
import type { FieldOverrides, HtmlTypes, Option } from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { getFieldRefs, getStepRefs } from "./-recipe-refs";
import type { RecipeAction } from "./-recipe-reducer";
import { ValidationRulesEditor } from "./-validation-rules-editor";
import { BehavioursEditor } from "./-behaviours-editor";
import { OptionsEditor } from "./-options-editor";
import { KEBAB_ID_PATTERN, kebabize } from "./-id-validation";
import styles from "../../styles/builder.module.css";

const FIELD_ID_ERROR =
  "Use lowercase letters, digits, and hyphens only. Must start with a letter (e.g. applicant-first-name).";
const FIELD_ID_DUPLICATE_ERROR =
  "This Field ID is already used by another field. Field IDs must be unique within a form.";

interface FieldEditPanelProps {
  field: RecipeFieldDraft;
  catalog: RegistryCatalog;
  draft: RecipeDraft;
  stepId: string;
  dispatch: React.Dispatch<RecipeAction>;
  onClose: () => void;
}

interface OverrideFormProps {
  overrides: FieldOverrides;
  htmlType: HtmlTypes;
  fieldRefs: FieldRef[];
  stepRefs: StepRef[];
  // The step this field lives in — seeds a new fieldConditionalOn's Target Step
  // so the field picker is enabled and scoped to this step by default (#519).
  currentStepId: string;
  onChange: (overrides: FieldOverrides) => void;
  // Returns true when the candidate Field ID Override duplicates another field's
  // resolved id. Omitted for block-child forms (deferred to the recipe-wide gate).
  checkDuplicateFieldId?: (candidateId: string) => boolean;
  defaultOptions?: Option[];
  defaultMultiple?: boolean;
  defaultRequired?: boolean;
}

const OPTIONS_HTML_TYPES: ReadonlySet<HtmlTypes> = new Set([
  "select",
  "radio",
  "checkbox",
]);

function isRequiredRule(rule: { value?: unknown } | undefined): boolean {
  return rule !== undefined && rule.value !== false;
}

function OverrideForm({
  overrides,
  htmlType,
  fieldRefs,
  stepRefs,
  currentStepId,
  onChange,
  checkDuplicateFieldId,
  defaultOptions,
  defaultMultiple,
  defaultRequired = false,
}: OverrideFormProps) {
  const [fieldIdError, setFieldIdError] = useState("");
  const fieldIdDuplicate =
    checkDuplicateFieldId?.(overrides.fieldId ?? "") ?? false;

  function patch(partial: Partial<FieldOverrides>) {
    onChange({ ...overrides, ...partial });
  }

  function fg(isOverridden: boolean) {
    return `${styles.formGroup} ${isOverridden ? styles.overrideField : ""}`;
  }

  return (
    <div>
      <div className={fg(overrides.fieldId !== undefined && overrides.fieldId !== "")}>
        <label>Field ID Override</label>
        <input
          type="text"
          value={overrides.fieldId ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            patch({ fieldId: value || undefined });
            setFieldIdError(
              value !== "" && !KEBAB_ID_PATTERN.test(value) ? FIELD_ID_ERROR : "",
            );
          }}
          onBlur={(e) => {
            const value = e.target.value;
            const normalized = kebabize(value);
            if (normalized !== value) patch({ fieldId: normalized || undefined });
            setFieldIdError("");
          }}
          placeholder="Leave blank to use default"
          aria-invalid={fieldIdError || fieldIdDuplicate ? true : undefined}
        />
        {fieldIdError ? (
          <span role="alert" style={{ fontSize: "0.75rem", color: "red" }}>
            {fieldIdError}
          </span>
        ) : (
          fieldIdDuplicate && (
            <span role="alert" style={{ fontSize: "0.75rem", color: "red" }}>
              {FIELD_ID_DUPLICATE_ERROR}
            </span>
          )
        )}
      </div>
      <div className={fg(overrides.label !== undefined && overrides.label !== "")}>
        <label>Label</label>
        <input
          type="text"
          value={overrides.label ?? ""}
          onChange={(e) => patch({ label: e.target.value || undefined })}
        />
      </div>
      <div className={fg(overrides.hint !== undefined && overrides.hint !== "")}>
        <label>Hint</label>
        <input
          type="text"
          value={overrides.hint ?? ""}
          onChange={(e) => patch({ hint: e.target.value || undefined })}
        />
      </div>
      <div className={`${fg(overrides.isDisabled === true)} ${styles.checkRow}`}>
        <label>
          <input
            type="checkbox"
            checked={overrides.isDisabled ?? false}
            onChange={(e) => patch({ isDisabled: e.target.checked || undefined })}
          />
          {" "}Disabled
        </label>
      </div>
      <div className={`${fg(overrides.isHidden === true)} ${styles.checkRow}`}>
        <label>
          <input
            type="checkbox"
            checked={overrides.isHidden ?? false}
            onChange={(e) => patch({ isHidden: e.target.checked || undefined })}
          />
          {" "}Hidden
        </label>
      </div>
      <div className={`${fg(overrides.validations?.required !== undefined)} ${styles.checkRow}`}>
        <label>
          <input
            type="checkbox"
            checked={
              overrides.validations?.required !== undefined
                ? isRequiredRule(overrides.validations.required)
                : defaultRequired
            }
            onChange={(e) => {
              const next = { ...(overrides.validations ?? {}) };
              if (e.target.checked) {
                next.required = { value: true };
              } else if (defaultRequired) {
                // Base requires the field; write an explicit false to override it.
                next.required = { value: false };
              } else {
                delete next.required;
              }
              patch({ validations: Object.keys(next).length > 0 ? next : undefined });
            }}
          />
          {" "}Required
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
        currentStepId={currentStepId}
        onChange={(behaviours) =>
          patch({ behaviours: behaviours.length > 0 ? behaviours : undefined })
        }
      />

      {OPTIONS_HTML_TYPES.has(htmlType) && (
        <>
          <div className={styles.sectionTitle}>Options</div>
          {htmlType === "select" && (
            <div className={`${fg(overrides.multiple !== undefined)} ${styles.checkRow}`}>
              <label>
                <input
                  type="checkbox"
                  checked={overrides.multiple ?? defaultMultiple ?? false}
                  onChange={(e) => patch({ multiple: e.target.checked })}
                />
                {" "}Multiple
              </label>
            </div>
          )}
          <div className={fg(overrides.options !== undefined)}>
            <OptionsEditor
              value={overrides.options ?? []}
              defaultValue={defaultOptions ?? []}
              isOverridden={overrides.options !== undefined}
              onChange={(next) => {
                if (next === undefined) {
                  patch({ options: undefined, multiple: undefined });
                } else {
                  patch({ options: next });
                }
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function FieldEditPanel({
  field,
  catalog,
  draft,
  stepId,
  dispatch,
  onClose,
}: FieldEditPanelProps) {
  const fieldRefs: FieldRef[] = useMemo(
    () => getFieldRefs(draft, catalog),
    [draft, catalog],
  );
  const stepRefs: StepRef[] = useMemo(() => getStepRefs(draft), [draft]);

  const item = getRegistryItem(field.ref, catalog);

  // Determine htmlType for component/custom fields
  const htmlType: HtmlTypes = (() => {
    if (!item) return "text";
    if ("primitive" in item) return item.primitive.htmlType;
    // For blocks, we'll handle per-child
    return "text";
  })();

  // These initializers only run on mount. Callers must unmount + remount the
  // modal when switching to a different field — re-rendering with a new `field`
  // prop would leave stale local state.
  const [overrides, setOverrides] = useState<FieldOverrides>({ ...field.overrides });
  const [childOverrides, setChildOverrides] = useState<ChildOverrides>(
    field.childOverrides ? { ...field.childOverrides } : {},
  );

  function handleSave() {
    dispatch({
      type: "UPDATE_FIELD_OVERRIDES",
      stepId,
      fieldId: field.id,
      overrides,
      childOverrides: field.kind === "block" ? childOverrides : undefined,
    });
    onClose();
  }

  function handleChildOverrideChange(
    childFieldId: string,
    childOverride: FieldOverrides,
  ) {
    setChildOverrides((prev) => ({ ...prev, [childFieldId]: childOverride }));
  }

  const isBlock = field.kind === "block" && item && "block" in item;
  const blockDef = isBlock ? (item as BlockDefinition) : null;

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <strong>Edit Field: {item?.displayName ?? field.ref}</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        {isBlock && blockDef ? (
          <div>
            {blockDef.block.elements.map((element) => {
              const childHtmlType: HtmlTypes = element.htmlType;
              const childOverride = childOverrides[element.fieldId] ?? {};
              return (
                <div
                  key={element.fieldId}
                  style={{
                    marginBottom: 16,
                    border: "1px solid #eee",
                    padding: 12,
                    borderRadius: 4,
                  }}
                >
                  <div className={styles.sectionTitle}>
                    {element.label} ({element.fieldId})
                  </div>
                  <OverrideForm
                    overrides={childOverride}
                    htmlType={childHtmlType}
                    fieldRefs={fieldRefs}
                    stepRefs={stepRefs}
                    currentStepId={stepId}
                    onChange={(updated) =>
                      handleChildOverrideChange(element.fieldId, updated)
                    }
                    defaultOptions={element.options}
                    defaultMultiple={element.multiple}
                    defaultRequired={isRequiredRule(element.validations?.required)}
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
            currentStepId={stepId}
            onChange={setOverrides}
            checkDuplicateFieldId={(candidate) =>
              fieldIdDuplicatesAnother(draft, catalog, field.id, candidate)
            }
            defaultOptions={item && "primitive" in item ? item.primitive.options : undefined}
            defaultMultiple={item && "primitive" in item ? item.primitive.multiple : undefined}
            defaultRequired={
              item && "primitive" in item
                ? isRequiredRule(item.primitive.validations?.required)
                : false
            }
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
