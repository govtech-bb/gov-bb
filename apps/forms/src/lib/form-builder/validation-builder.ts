import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidationProperties,
  FormValidation,
} from "@forms/types";
import {
  isDateComplete,
  dateValueToDate,
  valueIsEmpty,
  evaluateCondition,
} from "./validation-methods";
import { stepFieldIdConcactenator } from "./field-mapper";
import { validate } from "@govtech-bb/form-validation";
import type { StepScopedValues } from "@govtech-bb/form-validation";
import type {
  DateValue,
  DateValueInput,
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

// Resolve the controlling field's current value from the cross-field value
// trees: prefer the explicit `targetStepId` (falling back to the field's own
// step), then fall back to a flat scan so a same-named field elsewhere still
// resolves — mirroring how the shared `form-conditions` evaluator behaves.
const resolveOptionalIfTarget = (
  behaviour: OptionalIfBehaviour,
  fieldStepId: string,
  allValues: StepScopedValues,
): FieldValue | undefined => {
  const stepId = behaviour.targetStepId ?? fieldStepId;
  const stepValues = allValues[stepId];
  const fromStep = Array.isArray(stepValues)
    ? stepValues[0]?.[behaviour.targetFieldId]
    : stepValues?.[behaviour.targetFieldId];
  if (fromStep !== undefined) return fromStep as FieldValue;

  for (const values of Object.values(allValues)) {
    if (Array.isArray(values)) continue;
    if (behaviour.targetFieldId in values) {
      return values[behaviour.targetFieldId] as FieldValue;
    }
  }
  return undefined;
};

// The field is optional when it carries at least one `optionalIf` behaviour and
// *every* one matches (AND semantics, consistent with `fieldConditionalOn`).
const isOptionalNow = (
  behaviours: ClientPrimitive["behaviours"],
  fieldStepId: string,
  allValues: StepScopedValues,
): boolean => {
  const optionalIfs = (behaviours ?? []).filter(
    (b): b is OptionalIfBehaviour => b.type === "optionalIf",
  );
  if (optionalIfs.length === 0) return false;
  return optionalIfs.every((b) =>
    evaluateCondition(
      b.value,
      resolveOptionalIfTarget(b, fieldStepId, allValues),
      b.operator,
    ),
  );
};

// Client form state is keyed by the composite `field.id` (`stepId_fieldId`),
// while the shared validator keys by the bare `fieldId` (resolving references
// through `referenceFieldId` + optional `targetStepId`). Split a composite id
// back into its parts using the same last-separator convention the rest of the
// app uses (`getStepIdFromFieldName`): the field id never contains the
// separator, the step id may.
const splitCompositeId = (
  compositeId: string,
): { stepId: string; fieldId: string } => {
  const idx = compositeId.lastIndexOf(stepFieldIdConcactenator);
  if (idx <= 0) return { stepId: "", fieldId: compositeId };
  return {
    stepId: compositeId.slice(0, idx),
    fieldId: compositeId.slice(idx + stepFieldIdConcactenator.length),
  };
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
  const tree: Record<string, Record<string, unknown>> = {};

  for (const [compositeId, v] of Object.entries(formValues)) {
    const { stepId, fieldId } = splitCompositeId(compositeId);
    (tree[stepId] ??= {})[fieldId] = v;
  }

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
  // Either way, return pass-through handlers so the pipeline ignores them.
  if (field.htmlType === "show-hide" || !field.validations) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onBlur(_input) {},
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onDynamic(_input) {},
    };
  }

  const behaviours = field.behaviours;
  const primitive = clientPrimitiveToPrimitive(field);

  const listenTo =
    behaviours?.flatMap((b) =>
      "targetFieldId" in b ? [b.targetFieldId] : [],
    ) ?? [];

  return {
    onBlur({ value, fieldApi }) {
      if (field.htmlType === "date") {
        const dateValueInput = value as DateValueInput | undefined;
        if (!dateValueInput) return;
        if (!isDateComplete(dateValueInput)) return;

        const dateValue: DateValue = value as DateValue;
        const date: Date | null = dateValueToDate(dateValue);
        if (!date) return;

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // Used if the user enters a date like 10/13/2008,
        // which when converted to a date object, will be 10/1/2009
        // Aim is to have the field reflect that change.
        if (
          year != dateValue.year ||
          month != dateValue.month ||
          day != dateValue.day
        )
          fieldApi.handleChange({ day, month, year });
        return undefined;
      }
    },
    onDynamic({ value, fieldApi }) {
      // Defensive: an unrecognised value shape (neither empty, nor a known
      // primitive/array/date) used to short-circuit as "unknownState" with no
      // error. Preserve that by skipping validation entirely.
      const adaptedForFiles =
        field.htmlType === "file" && value != null
          ? fileListToArray(value)
          : value;
      if (valueIsEmpty(adaptedForFiles as FieldValue) === undefined)
        return undefined;

      const formValues = (fieldApi?.form?.state?.values ?? {}) as Record<
        string,
        unknown
      >;
      const { stepValues, allValues } = buildValueTrees(
        field,
        formValues,
        value,
      );

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
