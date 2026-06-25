import { useState, useMemo } from "react";
import {
  getRegistryItem,
  fieldIdDuplicatesAnother,
  getSwappableRefs,
  migrateOverridesForRef,
} from "@govtech-bb/form-builder";
import type {
  RecipeFieldDraft,
  RegistryCatalog,
  ChildOverrides,
  BlockDefinition,
  RecipeDraft,
} from "@govtech-bb/form-builder";
import { primitiveUISchema } from "@govtech-bb/form-types";
import type { FieldOverrides, HtmlTypes, Option, PrimitiveUI, ValidationRule } from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { getFieldRefs, getStepRefs } from "./-recipe-refs";
import type { RecipeAction } from "./-recipe-reducer";
import { ValidationRulesEditor } from "./-validation-rules-editor";
import { BehavioursEditor } from "./-behaviours-editor";
import { OptionsEditor } from "./-options-editor";
import { KEBAB_ID_PATTERN, kebabize } from "./-id-validation";
import styles from "../../styles/builder.module.css";
import { useEscClose } from "./-use-esc-close";

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
  // Validations declared on the base primitive — surfaced by the validation
  // editor as inherited, overridable rows (#618).
  baseValidations?: ValidationRule;
  // `ui` hints declared on the base primitive — the per-key fallback the ui
  // editor collapses to, so a registry default (e.g. National ID's
  // `width: "short"`) is shown truthfully and overriding it persists (#789).
  baseUi?: PrimitiveUI;
}

const OPTIONS_HTML_TYPES: ReadonlySet<HtmlTypes> = new Set([
  "select",
  "radio",
  "checkbox",
]);

function isRequiredRule(rule: { value?: unknown } | undefined): boolean {
  return rule !== undefined && rule.value !== false;
}

// Mirrors `DEFAULT_MSG` in packages/form-validation/src/rules/required.ts —
// the message the runtime falls back to when `required.error` is unset. Shown
// as the Required error-message placeholder (the inherited hint) so an author
// sees what they'd get if they leave it blank.
const DEFAULT_REQUIRED_MSG = "This field is required";

// Per-key presentation metadata for the schema-driven `ui` editor. Keys absent
// here fall back to a humanized key name; enum keys may declare the `default`
// value that collapses the key to `undefined` (no persistence). A `ui` default
// declared on the base primitive itself (e.g. National ID's `width: "short"`)
// takes precedence over the global default here (#789). Boolean keys need no
// entry beyond a label.
const UI_FIELD_META: Partial<
  Record<keyof PrimitiveUI, { label: string; default?: string }>
> = {
  width: { label: "Field width", default: "long" },
  hideLabel: { label: "Hide label" },
};

export function humanize(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Minimal view of a zod 4 inner type after unwrapping the outer `ZodOptional`.
type UiInnerSchema = { def: { type: string }; options?: string[] };

interface UiPropertiesEditorProps {
  ui: PrimitiveUI | undefined;
  baseUi: PrimitiveUI | undefined;
  onChange: (ui: PrimitiveUI | undefined) => void;
  fg: (isOverridden: boolean) => string;
}

// Schema-driven editor for a field's presentation `ui` object: it reads the
// keys off `primitiveUISchema` and renders one control per key (checkbox for
// booleans, native <select> for enums), so existing and future `ui` keys
// surface with no per-key panel wiring. Setting a key to its per-key default —
// the base primitive's `ui` value when declared, the global UI_FIELD_META
// default otherwise (#789) — drops it, and `ui` collapses to `undefined` once
// nothing is set, per the override contract (ADR 0013/0014).
function UiPropertiesEditor({ ui, baseUi, onChange, fg }: UiPropertiesEditorProps) {
  function setKey(key: keyof PrimitiveUI, value: string | boolean | undefined) {
    // A key is dropped only when explicitly cleared back to its default
    // (`undefined` from the control's onChange). We deliberately avoid `value
    // || undefined`: that would also drop a falsy-but-valid value — `false` is
    // persisted when it overrides a base `true` — which would silently break
    // the editor's schema-driven contract.
    const nextUi = { ...ui, [key]: value };
    const hasValue = Object.values(nextUi).some((v) => v !== undefined);
    onChange(hasValue ? (nextUi as PrimitiveUI) : undefined);
  }

  return (
    <>
      {Object.entries(primitiveUISchema.shape).map(([key, schema]) => {
        const k = key as keyof PrimitiveUI;
        const inner = (
          schema as unknown as { unwrap: () => UiInnerSchema }
        ).unwrap();
        const meta = UI_FIELD_META[k];
        const label = meta?.label ?? humanize(key);

        if (inner.def.type === "boolean") {
          const fallback = baseUi?.[k] === true;
          const checked = (ui?.[k] as boolean | undefined) ?? fallback;
          return (
            <div key={key} className={`${fg(ui?.[k] !== undefined)} ${styles.checkRow}`}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setKey(k, e.target.checked === fallback ? undefined : e.target.checked)
                  }
                />
                {" "}{label}
              </label>
            </div>
          );
        }

        if (inner.def.type === "enum") {
          const options = inner.options ?? [];
          const fallback =
            (baseUi?.[k] as string | undefined) ?? meta?.default ?? options[0];
          const current = (ui?.[k] as string | undefined) ?? fallback;
          const selectId = `ui-${key}`;
          return (
            <div key={key} className={fg(ui?.[k] !== undefined)}>
              <label htmlFor={selectId}>{label}</label>
              <select
                id={selectId}
                value={current}
                onChange={(e) =>
                  setKey(k, e.target.value === fallback ? undefined : e.target.value)
                }
              >
                {options.map((opt) => (
                  <option key={opt} value={opt}>{humanize(opt)}</option>
                ))}
              </select>
            </div>
          );
        }

        return null;
      })}
    </>
  );
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
  baseValidations,
  baseUi,
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
      <UiPropertiesEditor
        ui={overrides.ui}
        baseUi={baseUi}
        onChange={(ui) => patch({ ui })}
        fg={fg}
      />
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
      {(overrides.validations?.required !== undefined
        ? isRequiredRule(overrides.validations.required)
        : defaultRequired) && (
        <div className={fg(overrides.validations?.required?.error !== undefined)}>
          <label>
            Required error message
            <input
              type="text"
              value={overrides.validations?.required?.error ?? ""}
              placeholder={baseValidations?.required?.error ?? DEFAULT_REQUIRED_MSG}
              onChange={(e) => {
                const text = e.target.value;
                const next = { ...(overrides.validations ?? {}) };
                if (text) {
                  // Carry both keys: validations merge shallow at the rule level
                  // (`shallowMergeDefined`), so a bare `{ error }` would drop `value`.
                  next.required = { value: true, error: text };
                } else if (defaultRequired) {
                  // Base already requires the field — drop the override to restore
                  // the inherited message rather than persist a redundant rule.
                  delete next.required;
                } else {
                  // Required only because the override says so; keep it required,
                  // just without a custom message.
                  next.required = { value: true };
                }
                patch({ validations: Object.keys(next).length > 0 ? next : undefined });
              }}
            />
          </label>
        </div>
      )}

      <div className={styles.sectionTitle}>Validation Rules</div>
      <ValidationRulesEditor
        htmlType={htmlType}
        rules={overrides.validations}
        baseRules={baseValidations}
        fieldRefs={fieldRefs}
        stepRefs={stepRefs}
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

  // These initializers only run on mount. Callers must unmount + remount the
  // modal when switching to a different field — re-rendering with a new `field`
  // prop would leave stale local state. `ref` is held locally too so a type
  // swap re-derives htmlType and re-runs the rest of the form live (#642).
  const [ref, setRef] = useState<string>(field.ref);
  const [overrides, setOverrides] = useState<FieldOverrides>({ ...field.overrides });
  const [childOverrides, setChildOverrides] = useState<ChildOverrides>(
    field.childOverrides ? { ...field.childOverrides } : {},
  );

  const item = getRegistryItem(ref, catalog);

  // Determine htmlType for component/custom fields
  const htmlType: HtmlTypes = (() => {
    if (!item) return "text";
    if ("primitive" in item) return item.primitive.htmlType;
    // For blocks, we'll handle per-child
    return "text";
  })();

  // Generic primitives the field can switch to (empty for singletons/blocks).
  const swappableRefs = useMemo(
    () => getSwappableRefs(ref, catalog),
    [ref, catalog],
  );

  // Swap the field's type: re-derive the target htmlType from the new ref and
  // migrate the local overrides so incompatible ones drop before save.
  function handleChangeRef(nextRef: string) {
    const nextItem = getRegistryItem(nextRef, catalog);
    const toHtmlType =
      nextItem && "primitive" in nextItem ? nextItem.primitive.htmlType : htmlType;
    setOverrides((prev) => {
      // A field on its registry default fieldId would silently re-resolve to the
      // new ref's default on swap, dangling any condition/validation that
      // references the old id. Pin the current default as an explicit override
      // first so the resolved id survives the type change (#642).
      const pinned =
        prev.fieldId === undefined && item && "primitive" in item
          ? { ...prev, fieldId: item.primitive.fieldId }
          : prev;
      return migrateOverridesForRef(pinned, htmlType, toHtmlType);
    });
    setRef(nextRef);
  }

  function handleSave() {
    // A changed ref carries the new type + migrated overrides in one action;
    // an unchanged ref is a plain override update (and the only path for blocks,
    // which have no ref-swap control and own childOverrides).
    if (field.kind !== "block" && ref !== field.ref) {
      dispatch({
        type: "CHANGE_FIELD_REF",
        stepId,
        fieldId: field.id,
        ref,
        overrides,
      });
    } else {
      dispatch({
        type: "UPDATE_FIELD_OVERRIDES",
        stepId,
        fieldId: field.id,
        overrides,
        childOverrides: field.kind === "block" ? childOverrides : undefined,
      });
    }
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

  useEscClose(onClose);

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={`${styles.modalContent} ${styles.modalContentWide}`} role="dialog" aria-modal="true" aria-label="Edit Field" onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <strong>Edit Field: {item?.displayName ?? ref}</strong>
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
                    baseValidations={element.validations}
                    baseUi={element.ui}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className={styles.formGroup}>
              <label htmlFor="field-type-select">Field type</label>
              <div>
                <code>{ref}</code>
              </div>
              {swappableRefs.length > 0 ? (
                <select
                  id="field-type-select"
                  value={ref}
                  onChange={(e) => handleChangeRef(e.target.value)}
                >
                  <option value={ref}>{item?.displayName ?? ref}</option>
                  {swappableRefs.map((s) => (
                    <option key={s.ref} value={s.ref}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: "0.75rem", color: "#666" }}>
                  No similar types to switch to
                </span>
              )}
            </div>
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
            baseValidations={
              item && "primitive" in item ? item.primitive.validations : undefined
            }
            baseUi={item && "primitive" in item ? item.primitive.ui : undefined}
            />
          </>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button type="button" onClick={handleSave}>Save</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
