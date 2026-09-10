import { Button } from "../../component/ui/button";
import { Input } from "../../component/ui/input";
import { Select } from "../../component/ui/select";
import { Checkbox } from "../../component/ui/checkbox";
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
import type {
  FieldOverrides,
  HtmlTypes,
  Option,
  PrimitiveUI,
  ValidationRule,
} from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { getFieldRefs, getStepRefs } from "./-recipe-refs";
import type { RecipeAction } from "./-recipe-reducer";
import { ValidationRulesEditor } from "./-validation-rules-editor";
import { BehavioursEditor } from "./-behaviours-editor";
import { OptionsEditor } from "./-options-editor";
import { KEBAB_ID_PATTERN, kebabize } from "./-id-validation";
import styles from "../../styles/builder.module.css";
import { Dialog } from "../../component/ui/dialog";

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
  defaultRequired?: boolean;
  // Validations declared on the base primitive — surfaced by the validation
  // editor as inherited, overridable rows (#618).
  baseValidations?: ValidationRule;
  // Label declared on the base primitive — with the label override, it feeds
  // the behaviours editor's fieldArray miniature the applicant-visible label
  // (#2317).
  defaultLabel?: string;
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
type UiFieldMeta = Partial<
  Record<keyof PrimitiveUI, { label: string; default?: string }>
>;

const UI_FIELD_META: UiFieldMeta = {
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
// booleans, Select for enums), so existing and future `ui` keys
// surface with no per-key panel wiring. Setting a key to its per-key default —
// the base primitive's `ui` value when declared, the global UI_FIELD_META
// default otherwise (#789) — drops it, and `ui` collapses to `undefined` once
// nothing is set, per the override contract (ADR 0013/0014).
function UiPropertiesEditor({
  ui,
  baseUi,
  onChange,
  fg,
}: UiPropertiesEditorProps) {
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
        const inner = (schema as { unwrap: () => UiInnerSchema }).unwrap();
        const meta = UI_FIELD_META[k];
        const label = meta?.label ?? humanize(key);

        if (inner.def.type === "boolean") {
          const fallback = baseUi?.[k] === true;
          const checked = (ui?.[k] as boolean | undefined) ?? fallback;
          return (
            <div
              key={key}
              className={`${fg(ui?.[k] !== undefined)} ${styles.checkRow}`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(nextChecked) => {
                  setKey(k, nextChecked === fallback ? undefined : nextChecked);
                }}
                label={<> {label}</>}
              />
            </div>
          );
        }

        if (inner.def.type === "enum") {
          const options = inner.options ?? [];
          const fallback =
            (baseUi?.[k] as string | undefined) ?? meta?.default ?? options[0];
          const current = (ui?.[k] as string | undefined) ?? fallback;
          return (
            <div key={key} className={fg(ui?.[k] !== undefined)}>
              <Select
                label={label}
                value={current}
                onValueChange={(nextValue) => {
                  if (nextValue === null) return;
                  setKey(k, nextValue === fallback ? undefined : nextValue);
                }}
                items={[
                  ...options.map((opt) => ({
                    value: opt,
                    label: humanize(opt),
                  })),
                ]}
              />
            </div>
          );
        }

        return null;
      })}
    </>
  );
}

interface FieldIdOverrideInputProps {
  value: FieldOverrides["fieldId"];
  // True when the candidate id duplicates another field's resolved id.
  duplicate: boolean;
  onChange: (fieldId: FieldOverrides["fieldId"]) => void;
  fg: (isOverridden: boolean) => string;
}

// The Field ID Override input owns the transient format error and the
// kebab-on-blur normalization; the duplicate error is passed in from the parent
// (which alone can check the recipe-wide id set).
function FieldIdOverrideInput({
  value,
  duplicate,
  onChange,
  fg,
}: FieldIdOverrideInputProps) {
  const [fieldIdError, setFieldIdError] = useState("");
  return (
    <div className={fg(value !== undefined && value !== "")}>
      <Input
        type="text"
        value={value ?? ""}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next || undefined);
          setFieldIdError(
            next !== "" && !KEBAB_ID_PATTERN.test(next) ? FIELD_ID_ERROR : "",
          );
        }}
        onBlur={(e) => {
          const next = e.target.value;
          const normalized = kebabize(next);
          if (normalized !== next) onChange(normalized || undefined);
          setFieldIdError("");
        }}
        placeholder="Leave blank to use default"
        aria-invalid={fieldIdError || duplicate ? true : undefined}
        label={"Field ID Override"}
        className="w-full min-w-0"
      />
      {fieldIdError ? (
        <span
          role="alert"
          style={{ fontSize: "0.75rem", color: "var(--ui-danger-text)" }}
        >
          {fieldIdError}
        </span>
      ) : (
        duplicate && (
          <span
            role="alert"
            style={{ fontSize: "0.75rem", color: "var(--ui-danger-text)" }}
          >
            {FIELD_ID_DUPLICATE_ERROR}
          </span>
        )
      )}
    </div>
  );
}

interface RequiredRuleEditorProps {
  validations: FieldOverrides["validations"];
  // Whether the base primitive requires the field (drives the effective state
  // and whether unchecking must persist an explicit `value: false`).
  defaultRequired: boolean;
  baseValidations: ValidationRule | undefined;
  onChange: (validations: FieldOverrides["validations"]) => void;
  fg: (isOverridden: boolean) => string;
}

// The Required checkbox plus its conditional custom-error input. Both read and
// write the single `validations.required` rule, reflecting the *effective*
// required state (registry base merged with the override, #487).
function RequiredRuleEditor({
  validations,
  defaultRequired,
  baseValidations,
  onChange,
  fg,
}: RequiredRuleEditorProps) {
  const effectiveRequired =
    validations?.required !== undefined
      ? isRequiredRule(validations.required)
      : defaultRequired;

  return (
    <>
      <div
        className={`${fg(validations?.required !== undefined)} ${styles.checkRow}`}
      >
        <Checkbox
          checked={effectiveRequired}
          onCheckedChange={(nextChecked) => {
            const next = { ...(validations ?? {}) };
            if (nextChecked) {
              next.required = { value: true };
            } else if (defaultRequired) {
              // Base requires the field; write an explicit false to override it.
              next.required = { value: false };
            } else {
              delete next.required;
            }
            onChange(Object.keys(next).length > 0 ? next : undefined);
          }}
          label={<> Required</>}
        />
      </div>

      {effectiveRequired && (
        <div className={fg(validations?.required?.error !== undefined)}>
          <Input
            type="text"
            value={validations?.required?.error ?? ""}
            placeholder={
              baseValidations?.required?.error ?? DEFAULT_REQUIRED_MSG
            }
            onChange={(e) => {
              const text = e.target.value;
              const next = { ...(validations ?? {}) };
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
              onChange(Object.keys(next).length > 0 ? next : undefined);
            }}
            label={"Required error message"}
            className="w-full min-w-0"
          />
        </div>
      )}
    </>
  );
}

interface OptionsSectionProps {
  htmlType: HtmlTypes;
  options: FieldOverrides["options"];
  defaultOptions: Option[] | undefined;
  patch: (partial: Partial<FieldOverrides>) => void;
  fg: (isOverridden: boolean) => string;
}

// The Options block for choice fields (select/radio/checkbox).
function OptionsSection({
  htmlType,
  options,
  defaultOptions,
  patch,
  fg,
}: OptionsSectionProps) {
  if (!OPTIONS_HTML_TYPES.has(htmlType)) return null;
  return (
    <>
      <div className={styles.sectionTitle}>Options</div>

      <div className={fg(options !== undefined)}>
        <OptionsEditor
          value={options ?? []}
          defaultValue={defaultOptions ?? []}
          isOverridden={options !== undefined}
          onChange={(options) => patch({ options })}
        />
      </div>
    </>
  );
}

interface PlainOverrideFieldsProps {
  overrides: FieldOverrides;
  patch: (partial: Partial<FieldOverrides>) => void;
  fg: (isOverridden: boolean) => string;
}

// The unconditional override fields: the free-text Label and Hint, and the
// Disabled / Hidden toggles. No branching beyond the shared override-highlight.
function PlainOverrideFields({
  overrides,
  patch,
  fg,
}: PlainOverrideFieldsProps) {
  return (
    <>
      <div
        className={fg(overrides.label !== undefined && overrides.label !== "")}
      >
        <Input
          type="text"
          value={overrides.label ?? ""}
          onChange={(e) => patch({ label: e.target.value || undefined })}
          onBlur={(e) => {
            // Optionality is data, not copy: the renderer appends "(optional)"
            // from `required: {value: false}`, so a hand-typed suffix would
            // render doubled. Same normalise-on-blur shape as the Field ID.
            const stripped = e.target.value.replace(
              /\s*\(optional\)\s*$|,\s*optional\s*$/i,
              "",
            );
            if (stripped !== e.target.value)
              patch({ label: stripped || undefined });
          }}
          label={"Label"}
          className="w-full min-w-0"
        />
      </div>

      <div
        className={fg(overrides.hint !== undefined && overrides.hint !== "")}
      >
        <Input
          type="text"
          value={overrides.hint ?? ""}
          onChange={(e) => patch({ hint: e.target.value || undefined })}
          label={"Hint"}
          className="w-full min-w-0"
        />
      </div>

      <div
        className={`${fg(overrides.isDisabled === true)} ${styles.checkRow}`}
      >
        <Checkbox
          checked={overrides.isDisabled ?? false}
          onCheckedChange={(nextChecked) => {
            patch({ isDisabled: nextChecked || undefined });
          }}
          label={<> Disabled</>}
        />
      </div>

      <div className={`${fg(overrides.isHidden === true)} ${styles.checkRow}`}>
        <Checkbox
          checked={overrides.isHidden ?? false}
          onCheckedChange={(nextChecked) => {
            patch({ isHidden: nextChecked || undefined });
          }}
          label={<> Hidden</>}
        />
      </div>
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
  defaultRequired = false,
  baseValidations,
  baseUi,
  defaultLabel,
}: OverrideFormProps) {
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
      <FieldIdOverrideInput
        value={overrides.fieldId}
        duplicate={fieldIdDuplicate}
        onChange={(fieldId) => patch({ fieldId })}
        fg={fg}
      />
      <PlainOverrideFields overrides={overrides} patch={patch} fg={fg} />
      <UiPropertiesEditor
        ui={overrides.ui}
        baseUi={baseUi}
        onChange={(ui) => patch({ ui })}
        fg={fg}
      />
      <RequiredRuleEditor
        validations={overrides.validations}
        defaultRequired={defaultRequired}
        baseValidations={baseValidations}
        onChange={(validations) => patch({ validations })}
        fg={fg}
      />

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
        currentField={{
          label: overrides.label || defaultLabel || "",
          htmlType,
        }}
        onChange={(behaviours) =>
          patch({ behaviours: behaviours.length > 0 ? behaviours : undefined })
        }
      />

      <OptionsSection
        htmlType={htmlType}
        options={overrides.options}
        defaultOptions={defaultOptions}
        patch={patch}
        fg={fg}
      />
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
  const [overrides, setOverrides] = useState<FieldOverrides>({
    ...field.overrides,
  });
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
      nextItem && "primitive" in nextItem
        ? nextItem.primitive.htmlType
        : htmlType;
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
    <Dialog.Root
      defaultOpen
      onOpenChangeComplete={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog
        size={isBlock ? "xl" : "lg"}
        showCloseButton={false}
        className="space-y-5"
      >
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>Edit Field: {item?.displayName ?? ref}</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
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
                    border: "1px solid var(--ui-hairline)",
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
                    defaultRequired={isRequiredRule(
                      element.validations?.required,
                    )}
                    baseValidations={element.validations}
                    baseUi={element.ui}
                    defaultLabel={element.label}
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
                <Select
                  id="field-type-select"
                  value={ref}
                  onValueChange={(nextValue) => {
                    if (nextValue === null) return;
                    handleChangeRef(nextValue);
                  }}
                  items={[
                    { value: ref, label: item?.displayName ?? ref },
                    ...swappableRefs.map((s) => ({
                      value: s.ref,
                      label: s.displayName,
                    })),
                  ]}
                />
              ) : (
                <span
                  style={{ fontSize: "0.75rem", color: "var(--ui-subtle)" }}
                >
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
              defaultOptions={
                item && "primitive" in item ? item.primitive.options : undefined
              }
              defaultRequired={
                item && "primitive" in item
                  ? isRequiredRule(item.primitive.validations?.required)
                  : false
              }
              baseValidations={
                item && "primitive" in item
                  ? item.primitive.validations
                  : undefined
              }
              baseUi={
                item && "primitive" in item ? item.primitive.ui : undefined
              }
              defaultLabel={
                item && "primitive" in item ? item.primitive.label : undefined
              }
            />
          </>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Dialog.Close
            render={<Button onClick={handleSave} variant="primary" size="sm" />}
          >
            Save
          </Dialog.Close>
          <Dialog.Close
            render={<Button type="button" variant="secondary" size="sm" />}
          >
            Cancel
          </Dialog.Close>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
