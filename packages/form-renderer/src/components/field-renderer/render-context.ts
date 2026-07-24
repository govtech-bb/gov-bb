import { AnyFieldApi, type AnyFormApi } from "@tanstack/react-form";
import { ClientPrimitive, FieldValidationProperties } from "../../types";
import { FieldArrayBehaviour } from "@govtech-bb/form-types";
import { isDateValidationError } from "@govtech-bb/form-validation";
import type {
  DatePart,
  DateValidationError,
} from "@govtech-bb/form-validation";

/** An inset field entry passed from the parent radio/select group. */
export interface InsetFieldEntry {
  field: ClientPrimitive;
  validationProperties: FieldValidationProperties;
}

/**
 * The per-render values each field module needs. Computed once inside the
 * `<form.Field>` render prop by {@link buildFieldRenderContext} and passed to
 * the matching field renderer, so every field type derives its error state,
 * change handler, shared input props and label/hint/error ids the same way.
 */
export function buildFieldRenderContext(args: {
  field: ClientPrimitive;
  form: AnyFormApi;
  f: AnyFieldApi;
  fieldArray?: FieldArrayBehaviour;
  insetFieldsByOption?: Map<string, InsetFieldEntry[]>;
  formId?: string;
  previewToken?: string;
  draftToken?: string;
}) {
  const {
    field,
    form,
    f,
    fieldArray,
    insetFieldsByOption,
    formId,
    previewToken,
    draftToken,
  } = args;

  let errorMessage = "";
  // Date fields surface a structured { message, parts } error so the
  // failing day/month/year inputs can be highlighted individually.
  let dateError: DateValidationError | undefined;
  if (!f.state.meta.isValid) {
    const rawError: unknown = f.state.meta.errors[0];
    if (isDateValidationError(rawError)) {
      dateError = rawError;
      errorMessage = rawError.message;
    } else if (typeof rawError === "string") {
      errorMessage = rawError;
    }
  }
  const invalid = errorMessage ? true : undefined;
  // A plain string error carries no part information — highlight all.
  const partInvalid = (part: DatePart) =>
    invalid && (dateError?.parts.includes(part) ?? true) ? true : undefined;

  // revalidateLogic holds validation until a submit attempt, so typing in
  // a fresh field never nags. But once a field is showing an error (after
  // Continue/Submit), re-run validation on every change so the message
  // clears the moment the value becomes valid.
  const commitChange = (next: unknown) => {
    f.handleChange(next as never);
    if (!f.state.meta.isValid) void f.validate("submit");
  };

  const hintId = field.hint ? `${field.id}-hint` : undefined;
  const errorId = errorMessage ? `${field.id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  // When ui.hideLabel is set, keep the label/legend in the DOM (so the
  // accessible name is preserved) but hide it visually.
  const labelClass = (base: string) =>
    field.ui?.hideLabel ? `${base} govbb-visually-hidden` : base;

  const sharedProps = {
    type: field.htmlType,
    name: field.name,
    id: field.id,
    disabled: field.disabled,
    placeholder: field.placeholder,
    onBlur: f.handleBlur,
    "aria-describedby": describedBy,
  };

  // Surface required state to assistive tech. Not spread onto multi-option
  // checkbox inputs — there it would force every box to be checked.
  const isRequired = field.validations?.required?.value === true;
  const requiredProps = isRequired
    ? { required: true, "aria-required": true }
    : {};

  // GOV.UK telephone pattern: phone inputs carry autocomplete="tel" so
  // the browser can autofill a saved number (WCAG 2.2 SC 1.3.5).
  const autoComplete = field.htmlType === "tel" ? "tel" : undefined;

  return {
    field,
    form,
    f,
    fieldArray,
    errorMessage,
    invalid,
    partInvalid,
    commitChange,
    hintId,
    errorId,
    describedBy,
    labelClass,
    sharedProps,
    requiredProps,
    autoComplete,
    insetFieldsByOption,
    formId,
    previewToken,
    draftToken,
  };
}

export type FieldRenderContext = ReturnType<typeof buildFieldRenderContext>;
