import { Collapsible } from "../ui/collapsible";
import { cn } from "../ui/utils/cn";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/input";
import { Select } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { useState, useMemo, useId, type ReactNode } from "react";
import {
  getRegistryItem,
  fieldIdDuplicatesAnother,
  getSwappableRefs,
  migrateOverridesForRef,
  CUSTOM_ATTRIBUTE_DESCRIPTORS,
} from "@govtech-bb/form-builder";
import type {
  RecipeFieldDraft,
  RegistryCatalog,
  ChildOverrides,
  BlockDefinition,
  RecipeDraft,
  CustomAttributeDescriptor,
  CustomAttributeStringKey,
} from "@govtech-bb/form-builder";
import { primitiveUISchema } from "@govtech-bb/form-types";
import type {
  FieldOverrides,
  GeocodeTargets,
  HtmlTypes,
  Option,
  Primitive,
  PrimitiveUI,
  ValidationRule,
} from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./recipe-refs";
import { getFieldRefs, getStepRefs } from "./recipe-refs";
import type { RecipeAction } from "./recipe-reducer";
import { ValidationRulesEditor } from "./validation-rules-editor";
import { BehavioursEditor } from "./behaviours-editor";
import { FieldRefPicker } from "./field-ref-picker";
import { OptionsEditor } from "./options-editor";
import { OptionGroupsEditor } from "./option-groups-editor";
import { KEBAB_ID_PATTERN, kebabize } from "./id-validation";
import {
  isFieldlessRequiredWording,
  effectiveRequiredMessage,
  requiredRuleOnTick,
  syncRequiredMessageToLabel,
} from "./required-message";

import { Dialog } from "../ui/dialog";

const FIELD_ID_ERROR =
  "Use lowercase letters, digits, and hyphens only. Must start with a letter (e.g. applicant-first-name).";
const FIELD_ID_DUPLICATE_ERROR =
  "This Field ID is already used by another field. Field IDs must be unique within a form.";

interface FieldEditPanelProps {
  open: boolean;
  field: RecipeFieldDraft | null;
  catalog: RegistryCatalog;
  draft: RecipeDraft;
  stepId: string;
  dispatch: React.Dispatch<RecipeAction>;
  onClose: () => void;
  notice?: ReactNode;
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
  // resolved id — another component, or another child of the same block (#2896).
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
  // fieldId declared on the base primitive (block child: the element's) — the
  // id the field resolves to until a Field ID Override replaces it (#2685).
  defaultFieldId?: string;
  // The base primitive itself (registry component or block element) — the
  // fallback the type-specific settings read their effective values from
  // (#2873).
  basePrimitive?: Primitive;
}

const OPTIONS_HTML_TYPES: ReadonlySet<HtmlTypes> = new Set([
  "select",
  "radio",
  "checkbox",
]);

function isRequiredRule(rule: { value?: unknown } | undefined): boolean {
  return rule !== undefined && rule.value !== false;
}

const GENERIC_REQUIRED_WARNING =
  "This message doesn't name the field — every blank field on the page shows the same sentence. Write one that names it, e.g. “Employer name is required”.";

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
              className={cn(
                fg(ui?.[k] !== undefined),
                "flex items-start gap-2 [&_label]:m-0 [&_label]:inline-flex [&_label]:items-center [&_label]:gap-1.5",
              )}
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
  // The applicant-visible label (override ?? base), which an auto-derived
  // required message names (#2710).
  label: string | undefined;
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
  label,
  onChange,
  fg,
}: RequiredRuleEditorProps) {
  const effectiveRequired =
    validations?.required !== undefined
      ? isRequiredRule(validations.required)
      : defaultRequired;

  const effectiveMessage = effectiveRequiredMessage(
    validations,
    baseValidations,
  );
  const isGeneric = isFieldlessRequiredWording(effectiveMessage);
  const warningId = useId();

  return (
    <>
      <div
        className={cn(
          fg(validations?.required !== undefined),
          "flex items-start gap-2 [&_label]:m-0 [&_label]:inline-flex [&_label]:items-center [&_label]:gap-1.5",
        )}
      >
        <Checkbox
          checked={effectiveRequired}
          onCheckedChange={(nextChecked) => {
            const next = { ...(validations ?? {}) };
            if (nextChecked) {
              // Never a bare `{ value: true }`: validations merge shallow at
              // the rule level, so that would replace the base's whole
              // `required` object and discard the message it ships (#2710).
              const rule = requiredRuleOnTick({
                validations,
                baseValidations,
                defaultRequired,
                label,
              });
              if (rule) next.required = rule;
              else delete next.required;
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
            // The message an empty box really falls back to. Once the field
            // declares a `required` rule of its own the base's message is gone
            // from the merge, so showing it here would claim an inheritance
            // that no longer exists.
            placeholder={effectiveMessage}
            aria-describedby={isGeneric ? warningId : undefined}
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
          {isGeneric && (
            <span
              id={warningId}
              style={{ fontSize: "0.75rem", color: "var(--ui-warning-text)" }}
            >
              {GENERIC_REQUIRED_WARNING}
            </span>
          )}
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
      <div className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.05em] text-ui-subtle uppercase">
        Options
      </div>

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

interface CustomAttributesEditorProps {
  descriptors: CustomAttributeDescriptor[];
  overrides: FieldOverrides;
  basePrimitive: Primitive | undefined;
  // The fields on this field's own step — what a `fieldRef` descriptor's
  // pickers offer (#2886).
  stepFieldRefs: FieldRef[];
  patch: (partial: Partial<FieldOverrides>) => void;
  fg: (isOverridden: boolean) => string;
}

// Descriptor-driven editor for the attributes only this htmlType's renderer
// reads (a content block's style, markdown body and details summary; an
// address lookup's geocode targets; a checkbox accordion's categories), one
// control per CUSTOM_ATTRIBUTE_DESCRIPTORS entry (#2873). Same contract as
// the `ui` editor: show the effective value (override ?? base primitive), and
// drop the key when the author sets it back to the base value or clears it.
function CustomAttributesEditor({
  descriptors,
  overrides,
  basePrimitive,
  stepFieldRefs,
  patch,
  fg,
}: CustomAttributesEditorProps) {
  function effective(
    key: CustomAttributeStringKey | "label",
  ): string | undefined {
    return overrides[key] ?? basePrimitive?.[key];
  }

  function setKey(key: CustomAttributeStringKey, value: string) {
    // An empty control, or one set back to the base value, drops the key so
    // the merge falls through to the base (the `ui` editor's contract).
    const next =
      value === "" || value === basePrimitive?.[key] ? undefined : value;
    patch({ [key]: next } as Partial<FieldOverrides>);
  }

  function setFieldRef(
    key: "geocodeTargets",
    target: keyof GeocodeTargets,
    fieldId: string,
  ) {
    // An override replaces the object whole (the merge is a shallow spread),
    // so edit the effective object; "" is the picker's cleared state. Once no
    // target is left the key goes too, so the renderer never sees `{}`.
    const next: GeocodeTargets = {
      ...(overrides[key] ?? basePrimitive?.[key]),
    };
    if (fieldId === "") delete next[target];
    else next[target] = fieldId;
    patch({ [key]: Object.keys(next).length > 0 ? next : undefined });
  }

  return (
    <>
      <div className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.05em] text-ui-subtle uppercase">
        Type-specific settings
      </div>
      {descriptors.map((descriptor) => {
        if (
          descriptor.showWhen &&
          effective(descriptor.showWhen.key) !== descriptor.showWhen.equals
        )
          return null;
        const isOverridden = overrides[descriptor.key] !== undefined;

        if (descriptor.kind === "fieldRef") {
          const targets =
            overrides[descriptor.key] ?? basePrimitive?.[descriptor.key];
          return (
            <fieldset key={descriptor.key} className={fg(isOverridden)}>
              <legend className="text-sm font-medium">
                {descriptor.label}
              </legend>
              {descriptor.hint && (
                <p className="text-sm text-ui-subtle">{descriptor.hint}</p>
              )}
              {descriptor.fields.map((target) => (
                <FieldRefPicker
                  key={target.key}
                  label={target.label}
                  value={targets?.[target.key] ?? ""}
                  fieldRefs={stepFieldRefs}
                  onChange={(fieldId) =>
                    setFieldRef(descriptor.key, target.key, fieldId)
                  }
                />
              ))}
            </fieldset>
          );
        }

        if (descriptor.kind === "optionGroups") {
          return (
            <fieldset key={descriptor.key} className={fg(isOverridden)}>
              <legend className="text-sm font-medium">
                {descriptor.label}
              </legend>
              {descriptor.hint && (
                <p className="text-sm text-ui-subtle">{descriptor.hint}</p>
              )}
              <OptionGroupsEditor
                value={overrides[descriptor.key] ?? []}
                defaultValue={basePrimitive?.[descriptor.key] ?? []}
                isOverridden={isOverridden}
                onChange={(groups) => patch({ [descriptor.key]: groups })}
              />
            </fieldset>
          );
        }

        const value = effective(descriptor.key) ?? "";

        if (descriptor.kind === "enum") {
          return (
            <div key={descriptor.key} className={fg(isOverridden)}>
              <Select
                label={descriptor.label}
                value={value}
                onValueChange={(nextValue) => {
                  if (nextValue === null) return;
                  setKey(descriptor.key, nextValue);
                }}
                items={descriptor.options.map((opt) => ({
                  value: opt,
                  label: humanize(opt),
                }))}
              />
            </div>
          );
        }

        const placeholder = descriptor.fallbackKey
          ? effective(descriptor.fallbackKey)
          : undefined;

        if (descriptor.kind === "markdown") {
          return (
            <div key={descriptor.key} className={fg(isOverridden)}>
              <Textarea
                value={value}
                onChange={(e) => setKey(descriptor.key, e.target.value)}
                placeholder={placeholder}
                label={descriptor.label}
                description={descriptor.hint}
                autoResize
                minRows={4}
                className="w-full min-w-0"
              />
            </div>
          );
        }

        return (
          <div key={descriptor.key} className={fg(isOverridden)}>
            <Input
              type="text"
              value={value}
              onChange={(e) => setKey(descriptor.key, e.target.value)}
              placeholder={placeholder}
              label={descriptor.label}
              description={descriptor.hint}
              className="w-full min-w-0"
            />
          </div>
        );
      })}
    </>
  );
}

interface PlainOverrideFieldsProps {
  overrides: FieldOverrides;
  htmlType: HtmlTypes;
  basePrimitive: Primitive | undefined;
  stepFieldRefs: FieldRef[];
  patch: (partial: Partial<FieldOverrides>) => void;
  fg: (isOverridden: boolean) => string;
  defaultLabel?: string;
  // The id the field resolves to right now (override ?? registry default);
  // undefined for a custom component that declares none.
  effectiveFieldId: string | undefined;
  // True when that effective id duplicates another field's resolved id.
  fieldIdDuplicate: boolean;
}

// The unconditional override fields: the free-text Label, the read-only
// effective Field ID, Hint, and the Availability collapsible — the Disabled /
// Hidden toggles plus the type-specific settings when the htmlType has any.
function PlainOverrideFields({
  overrides,
  htmlType,
  basePrimitive,
  stepFieldRefs,
  patch,
  fg,
  defaultLabel,
  effectiveFieldId,
  fieldIdDuplicate,
}: PlainOverrideFieldsProps) {
  const customDescriptors = CUSTOM_ATTRIBUTE_DESCRIPTORS[htmlType];
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
          placeholder={defaultLabel}
          label={"Label"}
          className="w-full min-w-0"
        />
      </div>

      {/* The id this field resolves to (ADR 0010): the override when set,
          else the registry default — never derived from the label. Tracks the
          Field ID Override as it is typed. readOnly, not disabled: it stays
          focusable and copyable. The shared-id warning repeats here because
          the override input lives in the collapsed Advanced settings. */}
      <div className={fg(false)}>
        <Input
          type="text"
          value={effectiveFieldId ?? "—"}
          readOnly
          aria-invalid={fieldIdDuplicate ? true : undefined}
          label={"Field ID"}
          description="Change it under Advanced settings → Field ID Override."
          className="w-full min-w-0 font-mono text-ui-subtle"
        />
        {fieldIdDuplicate && (
          <span
            role="alert"
            style={{ fontSize: "0.75rem", color: "var(--ui-danger-text)" }}
          >
            {FIELD_ID_DUPLICATE_ERROR}
          </span>
        )}
      </div>

      {/* A content block never renders a hint (content-field.tsx reads only
          variant/content/summary), so offering one would author a no-op. */}
      {htmlType !== "content" && (
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
      )}

      {/* Open by default when the type has settings of its own: for an
          Information block the body text *is* the question (#2873). */}
      <Collapsible.Root
        className="mb-4"
        defaultOpen={customDescriptors.length > 0}
      >
        <Collapsible.DefaultTrigger className="cursor-pointer py-2 text-sm text-ui-subtle">
          Availability
        </Collapsible.DefaultTrigger>
        <Collapsible.Panel keepMounted>
          <div className="pt-2">
            {" "}
            <div
              className={cn(
                fg(overrides.isDisabled === true),
                "flex items-start gap-2 [&_label]:m-0 [&_label]:inline-flex [&_label]:items-center [&_label]:gap-1.5",
              )}
            >
              <Checkbox
                checked={overrides.isDisabled ?? false}
                onCheckedChange={(nextChecked) => {
                  patch({ isDisabled: nextChecked || undefined });
                }}
                label={<> Disabled</>}
              />
            </div>
            <div
              className={cn(
                fg(overrides.isHidden === true),
                "flex items-start gap-2 [&_label]:m-0 [&_label]:inline-flex [&_label]:items-center [&_label]:gap-1.5",
              )}
            >
              <Checkbox
                checked={overrides.isHidden ?? false}
                onCheckedChange={(nextChecked) => {
                  patch({ isHidden: nextChecked || undefined });
                }}
                label={<> Hidden</>}
              />
            </div>
            {customDescriptors.length > 0 && (
              <CustomAttributesEditor
                descriptors={customDescriptors}
                overrides={overrides}
                basePrimitive={basePrimitive}
                stepFieldRefs={stepFieldRefs}
                patch={patch}
                fg={fg}
              />
            )}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
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
  defaultFieldId,
  basePrimitive,
}: OverrideFormProps) {
  // The id the field resolves to right now (ADR 0010): the unsaved override
  // when set, else the registry default. The duplicate check runs on it, so
  // two untouched fields of one type warn without anyone typing an override.
  // Advisory only — the recipe-wide gate still blocks Save/Deploy.
  const effectiveFieldId = overrides.fieldId ?? defaultFieldId;
  const fieldIdDuplicate =
    checkDuplicateFieldId?.(effectiveFieldId ?? "") ?? false;

  function patch(partial: Partial<FieldOverrides>) {
    const next = { ...overrides, ...partial };
    // A renamed field keeps a required message that names it — the one place
    // both this form and the block-child forms funnel a label edit through
    // (#2710). Only an auto-derived message is rewritten; authored copy stays.
    if ("label" in partial) {
      const synced = syncRequiredMessageToLabel({
        validations: next.validations,
        baseValidations,
        defaultRequired,
        previousLabel: overrides.label ?? defaultLabel,
        // Only an authored label: clearing the override falls back to the
        // registry's label, which for the generic primitives is a developer
        // placeholder ("Text"), and deriving from it would just restate the
        // generic message.
        nextLabel: next.label,
      });
      if (synced !== next.validations) next.validations = synced;
    }
    onChange(next);
  }

  function fg(_isOverridden: boolean) {
    return "mb-4 flex flex-col gap-1.5 [&_input]:w-full [&_label]:text-sm [&_label]:font-medium";
  }

  // A content block holds no value, so Required and validation rules would
  // be authored no-ops (VALIDATION_RULE_DESCRIPTORS.content is []). Label
  // stays: it names the field row and is the `details` summary fallback.
  const isContent = htmlType === "content";

  return (
    <div>
      <PlainOverrideFields
        overrides={overrides}
        htmlType={htmlType}
        basePrimitive={basePrimitive}
        stepFieldRefs={fieldRefs.filter((f) => f.stepId === currentStepId)}
        patch={patch}
        fg={fg}
        defaultLabel={defaultLabel}
        effectiveFieldId={effectiveFieldId}
        fieldIdDuplicate={fieldIdDuplicate}
      />
      {!isContent && (
        <RequiredRuleEditor
          validations={overrides.validations}
          defaultRequired={defaultRequired}
          baseValidations={baseValidations}
          label={overrides.label ?? defaultLabel}
          onChange={(validations) => patch({ validations })}
          fg={fg}
        />
      )}
      <OptionsSection
        htmlType={htmlType}
        options={overrides.options}
        defaultOptions={defaultOptions}
        patch={patch}
        fg={fg}
      />
      {!isContent && (
        <Collapsible.Root className="mt-5 border-t border-ui-hairline">
          <Collapsible.DefaultTrigger className="cursor-pointer py-4 text-sm font-medium">
            Validation rules
          </Collapsible.DefaultTrigger>
          <Collapsible.Panel keepMounted>
            <ValidationRulesEditor
              htmlType={htmlType}
              rules={overrides.validations}
              baseRules={baseValidations}
              fieldRefs={fieldRefs}
              stepRefs={stepRefs}
              onChange={(validations) => patch({ validations })}
            />
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
      <Collapsible.Root className="border-t border-ui-hairline">
        <Collapsible.DefaultTrigger className="cursor-pointer py-4 text-sm font-medium">
          Logic and conditions
        </Collapsible.DefaultTrigger>
        <Collapsible.Panel keepMounted>
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
              patch({
                behaviours: behaviours.length > 0 ? behaviours : undefined,
              })
            }
          />
        </Collapsible.Panel>
      </Collapsible.Root>
      <Collapsible.Root className="border-t border-ui-hairline">
        <Collapsible.DefaultTrigger className="cursor-pointer py-4 text-sm font-medium">
          Advanced settings
        </Collapsible.DefaultTrigger>
        <Collapsible.Panel keepMounted>
          <FieldIdOverrideInput
            value={overrides.fieldId}
            duplicate={fieldIdDuplicate}
            onChange={(fieldId) => patch({ fieldId })}
            fg={fg}
          />
          <UiPropertiesEditor
            ui={overrides.ui}
            baseUi={baseUi}
            onChange={(ui) => patch({ ui })}
            fg={fg}
          />
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  );
}

export function FieldEditPanel({
  open,
  field,
  onClose,
  ...props
}: FieldEditPanelProps) {
  const item = field ? getRegistryItem(field.ref, props.catalog) : undefined;
  return (
    <Dialog.Root
      open={open && field !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog
        size={field?.kind === "block" && item && "block" in item ? "xl" : "lg"}
        showCloseButton={false}
        className="space-y-5"
      >
        {field && <FieldEditForm key={field.id} field={field} {...props} />}
      </Dialog>
    </Dialog.Root>
  );
}

function FieldEditForm({
  field,
  catalog,
  draft,
  stepId,
  dispatch,
  notice,
}: Omit<FieldEditPanelProps, "open" | "onClose" | "field"> & {
  field: RecipeFieldDraft;
}) {
  const fieldRefs: FieldRef[] = useMemo(
    () => getFieldRefs(draft, catalog),
    [draft, catalog],
  );
  const stepRefs: StepRef[] = useMemo(() => getStepRefs(draft), [draft]);

  // The portal unmounts this form after the closing animation, resetting its
  // draft for the next edit while the dialog itself stays mounted.
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
    <>
      <div className="sticky -top-6 z-10 -mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-ui-hairline bg-ui-base px-6 py-4">
        <Dialog.Title>Edit question</Dialog.Title>
        <Dialog.Close render={<Button variant="ghost" size="sm" />}>
          Close
        </Dialog.Close>
      </div>

      {notice}
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
                <div className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.05em] text-ui-subtle uppercase">
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
                  checkDuplicateFieldId={(candidate) =>
                    fieldIdDuplicatesAnother(
                      draft,
                      catalog,
                      field.id,
                      candidate,
                      element.fieldId,
                    )
                  }
                  defaultOptions={element.options}
                  defaultRequired={isRequiredRule(
                    element.validations?.required,
                  )}
                  baseValidations={element.validations}
                  baseUi={element.ui}
                  defaultLabel={element.label}
                  defaultFieldId={element.fieldId}
                  basePrimitive={element}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mb-3.5 flex flex-col gap-1.25 [&_input]:box-border [&_input]:w-full [&_textarea]:box-border [&_textarea]:w-full [&_label]:text-[13px] [&_label]:font-medium [&_label]:text-ui-brand-hover [[data-field-row]>&]:w-full">
            <label htmlFor="field-type-select">Field type</label>

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
              <span style={{ fontSize: "0.75rem", color: "var(--ui-subtle)" }}>
                {item?.displayName ?? ref}
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
            baseUi={item && "primitive" in item ? item.primitive.ui : undefined}
            defaultLabel={
              item && "primitive" in item ? item.primitive.label : undefined
            }
            defaultFieldId={
              item && "primitive" in item ? item.primitive.fieldId : undefined
            }
            basePrimitive={
              item && "primitive" in item ? item.primitive : undefined
            }
          />
        </>
      )}

      <div className="sticky -bottom-6 -mx-6 -mb-6 flex justify-end gap-2 border-t border-ui-hairline bg-ui-base px-6 py-4">
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
    </>
  );
}
