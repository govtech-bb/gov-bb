import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidationProperties,
  FormValidation,
} from "@forms/types";
import type { AnyFieldApi } from "@tanstack/react-form";
import { valueIsEmpty } from "./validation-methods";
import { buildStepScopedValues } from "./helpers/value-tree";
import { validate, validateDateField } from "@govtech-bb/form-validation";
import type { StepScopedValues } from "@govtech-bb/form-validation";
import {
  evaluateCondition,
  flattenStepValues,
} from "@govtech-bb/form-conditions";
import type {
  FieldValue,
  OptionalIfBehaviour,
  Primitive,
} from "@govtech-bb/form-types";

export const buildValidation = (
  contract: ClientServiceContract,
): FormValidation => {
  const fieldValidationProperties: Record<string, FieldValidationProperties> =
    {};
  const defaults: Record<string, FieldValue> = {};

  for (const step of contract.steps) {
    for (const field of step.fields) {
      fieldValidationProperties[field.id] =
        buildFieldValidationProperties(field);
      if (field.defaultValue) {
        defaults[field.id] = field.defaultValue;
      }
    }
  }

  return {
    properties: fieldValidationProperties,
    defaults,
  };
};

const clientPrimitiveToPrimitive = (field: ClientPrimitive): Primitive => {
  return {
    // The shared validator keys everything by the bare `fieldId` and resolves
    // cross-field references via `referenceFieldId`, so the primitive must carry
    // the real `fieldId` (not the display `name`) for references to resolve.
    fieldId: field.fieldId,
    label: field.label,
    htmlType: field.htmlType,
    validations: field.validations,
    ...(field.options && { options: field.options }),
  } as Primitive;
};

// optionalIf: when a field's condition matches, its `required` rule is relaxed
// (the field becomes optional) without affecting visibility — the field always
// renders. Clone the primitive without its `required` validation; all other
// (format) rules are preserved so they still fire when it is filled.
const stripRequired = (primitive: Primitive): Primitive => {
  if (!primitive.validations?.required) return primitive;
  const validations = { ...primitive.validations };
  delete validations.required;
  return { ...primitive, validations };
};

// The field is optional when it carries at least one `optionalIf` behaviour and
// *every* one matches (AND semantics, consistent with `fieldConditionalOn`).
// Conditions are evaluated with the shared `@govtech-bb/form-conditions`
// evaluator — the same one `apps/api` uses — so the client's optional verdict
// matches the server's for the same values. A behaviour with no explicit
// `targetStepId` resolves against the field's own step (the historical
// fallback). Conditions inside a repeatable step resolve instance-locally
// because `handleMissingTargetStepIds` has already rewritten their
// `targetStepId` to the synthetic instance step.
const isOptionalNow = (
  behaviours: ClientPrimitive["behaviours"],
  fieldStepId: string,
  allValues: StepScopedValues,
): boolean => {
  const optionalIfs = (behaviours ?? []).filter(
    (b): b is OptionalIfBehaviour => b.type === "optionalIf",
  );
  if (optionalIfs.length === 0) return false;
  const flatValues = flattenStepValues(allValues);
  return optionalIfs.every((b) => {
    const behaviour = b.targetStepId ? b : { ...b, targetStepId: fieldStepId };
    return evaluateCondition(behaviour, allValues, flatValues);
  });
};

// The shared file runners expect a plain `{ name, size, type }[]`; the live form
// hands us a `FileList`. Convert at the boundary.
const fileListToArray = (
  value: unknown,
): Array<{ name: string; size: number; type: string }> =>
  Array.from(value as ArrayLike<File>).map((f) => ({
    name: f.name,
    size: f.size,
    type: f.type,
  }));

// Mirror of the shared validator's per-htmlType notion of "empty". When the app
// considers the current value empty (via `valueIsEmpty`), substitute the empty
// shape the shared `validateField` recognises so its required-first /
// empty-skip orchestration fires on exactly the values the local path treated
// as empty (e.g. a boolean-`false` checkbox, an incomplete date, a blank
// number). Keep this aligned with `EMPTY_BY_TYPE` in
// `packages/form-validation/src/validate-field.ts`.
const SHARED_EMPTY_BY_TYPE: Record<string, unknown> = {
  number: undefined,
  checkbox: [],
  select: [],
  file: [],
};
const emptyForType = (htmlType: string): unknown =>
  htmlType in SHARED_EMPTY_BY_TYPE ? SHARED_EMPTY_BY_TYPE[htmlType] : "";

// Adapt the live current-field value for the shared validator: normalise files
// to plain objects and collapse "empty" values to the shared empty shape.
const adaptCurrentValue = (field: ClientPrimitive, raw: unknown): unknown => {
  const value =
    field.htmlType === "file" && raw != null ? fileListToArray(raw) : raw;

  if (valueIsEmpty(value as FieldValue)) return emptyForType(field.htmlType);
  return value;
};

// Build the `stepValues` (current step, keyed by bare fieldId) and `allValues`
// (`StepScopedValues`, keyed by stepId) trees the shared validator needs, from
// the form's full value map. The current field's entry is taken from the live
// `value` (which may not yet be in form state) rather than from the snapshot.
const buildValueTrees = (
  field: ClientPrimitive,
  formValues: Record<string, unknown>,
  currentValue: unknown,
): { stepValues: Record<string, unknown>; allValues: StepScopedValues } => {
  const tree = buildStepScopedValues(formValues) as Record<
    string,
    Record<string, unknown>
  >;

  (tree[field.stepId] ??= {})[field.fieldId] = adaptCurrentValue(
    field,
    currentValue,
  );

  return {
    stepValues: tree[field.stepId] ?? {},
    allValues: tree as StepScopedValues,
  };
};

// Reproduce the local error formatting the app relied on: de-duplicate
// messages, and strip the field name out of every error after the first (the
// first error keeps the full message). The shared runners emit the configured
// `error` strings verbatim, so user-facing wording is preserved.
const formatErrors = (errors: string[], fieldName: string): string[] => {
  const out: string[] = [];
  errors.forEach((msg, index) => {
    const formatted = index === 0 ? msg : msg.replace(fieldName, "");
    if (!out.includes(formatted)) out.push(formatted);
  });
  return out;
};

// This allows us to recalculate the methods after restoring from cache.
export const buildFieldValidationProperties = (
  field: ClientPrimitive,
): FieldValidationProperties => {
  // The show-hide toggle stores a boolean (open/closed state) and never has its
  // own validation rules; fields without validations have nothing to check.
  // Either way, return a pass-through handler so the pipeline ignores them.
  if (field.htmlType === "show-hide" || !field.validations) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onDynamic(_input) {
        return undefined;
      },
    };
  }

  const behaviours = field.behaviours;
  const primitive = clientPrimitiveToPrimitive(field);

  const listenTo =
    behaviours?.flatMap((b) =>
      "targetFieldId" in b ? [b.targetFieldId] : [],
    ) ?? [];

  const valueTreesFor = (fieldApi: AnyFieldApi | undefined, value: unknown) => {
    const formValues = (fieldApi?.form?.state?.values ?? {}) as Record<
      string,
      unknown
    >;
    return buildValueTrees(field, formValues, value);
  };

  return {
    onDynamic({ value, fieldApi }) {
      // Date fields go through the GOV.UK date validator, which needs the raw
      // (possibly incomplete) { day, month, year } value and returns a single
      // { message, parts } error so the renderer can highlight failing parts.
      if (field.htmlType === "date") {
        const { stepValues, allValues } = valueTreesFor(fieldApi, value);
        // optionalIf applies here too: relax `required` when its condition
        // matches, exactly as the general path below does.
        const datePrimitive = isOptionalNow(
          field.behaviours,
          field.stepId,
          allValues,
        )
          ? stripRequired(primitive)
          : primitive;
        const dateError = validateDateField(
          datePrimitive,
          value,
          allValues,
          stepValues,
        );
        return dateError ? [dateError] : undefined;
      }
      // Defensive: an unrecognised value shape (neither empty, nor a known
      // primitive/array/date) used to short-circuit as "unknownState" with no
      // error. Preserve that by skipping validation entirely.
      const adaptedForFiles =
        field.htmlType === "file" && value != null
          ? fileListToArray(value)
          : value;
      if (valueIsEmpty(adaptedForFiles as FieldValue) === undefined)
        return undefined;

      const { stepValues, allValues } = valueTreesFor(fieldApi, value);

      // `optionalIf` relaxes `required` when its condition matches; the field
      // is never hidden, so only the required rule is dropped before validating.
      const primitiveToValidate = isOptionalNow(
        field.behaviours,
        field.stepId,
        allValues,
      )
        ? stripRequired(primitive)
        : primitive;

      const result = validate({
        primitives: [primitiveToValidate],
        stepValues,
        allValues,
      });

      const errors = result.errors[field.fieldId];
      if (!errors || errors.length === 0) return undefined;
      return formatErrors(errors, field.name);
    },
    onChangeListenTo: listenTo,
  };
};
