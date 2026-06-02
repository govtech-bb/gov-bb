import { AnyFieldApi } from "@tanstack/react-form";
import {
  ClientPrimitive,
  FieldValidationProperties,
  UploadedFile,
} from "@forms/types";
import React, { JSX, useEffect, useState } from "react";
import ErrorMessage from "./error-message";
import { RequiredState, checkConditionalOn } from "@forms/lib";
import { DateValue, FieldArrayBehaviour } from "@govtech-bb/form-types";
import FileUpload from "./file-upload";
import { MaskedInput } from "./masked-input";

/** An inset field entry passed from the parent radio group. */
export interface InsetFieldEntry {
  field: ClientPrimitive;
  validationProperties: FieldValidationProperties;
}

/**
 * Parse a date-part text input (day/month/year) into the numeric DateValue
 * model. Empty or non-numeric input becomes `undefined` so the field never
 * stores `0` or `NaN`.
 */
const parseDatePart = (raw: string): number | undefined => {
  if (raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/** Render a numeric date part, showing "" for a missing or NaN value. */
const displayDatePart = (part: number | undefined): string =>
  part === undefined || Number.isNaN(part) ? "" : String(part);

type DatePart = "day" | "month" | "year";

/**
 * The Day / Month / Year inputs of a date field.
 *
 * Keeps the raw text the user typed in local state so an invalid entry (e.g.
 * "33w") stays on screen until they edit it again, while still propagating the
 * numeric DateValue model upstream for validation. The visible text is the
 * source of truth for display; the parsed number is what gets stored.
 */
function DateField({
  f,
  field,
  labelClass,
  sharedProps,
  requiredProps,
  invalid,
  errorId,
  errorMessage,
  hintId,
}: {
  f: AnyFieldApi;
  field: ClientPrimitive;
  labelClass: (base: string) => string;
  sharedProps: React.InputHTMLAttributes<HTMLInputElement>;
  requiredProps: React.InputHTMLAttributes<HTMLInputElement>;
  invalid: boolean | undefined;
  errorId?: string;
  errorMessage: string;
  hintId?: string;
}) {
  const value = f.state.value as DateValue | undefined;

  const [raw, setRaw] = useState<Record<DatePart, string>>({
    day: displayDatePart(value?.day),
    month: displayDatePart(value?.month),
    year: displayDatePart(value?.year),
  });

  // Re-sync the visible text when the stored value changes from outside this
  // component (e.g. cache restore or form reset). We only adopt the stored
  // value for a part when it differs from what the current text parses to, so
  // the raw text a user just typed (including invalid input) is never clobbered.
  useEffect(() => {
    setRaw((prev) => {
      const next = { ...prev };
      (["day", "month", "year"] as DatePart[]).forEach((part) => {
        if (parseDatePart(prev[part]) !== value?.[part]) {
          next[part] = displayDatePart(value?.[part]);
        }
      });
      return next;
    });
  }, [value?.day, value?.month, value?.year]);

  const handlePartChange = (part: DatePart) => (text: string) => {
    setRaw((prev) => ({ ...prev, [part]: text }));
    f.handleChange({ ...value, [part]: parseDatePart(text) });
  };

  const parts: { part: DatePart; label: string; extra?: object }[] = [
    { part: "day", label: "Day", extra: { min: 1, max: 31 } },
    { part: "month", label: "Month", extra: { min: 1, max: 12 } },
    { part: "year", label: "Year" },
  ];

  return (
    <fieldset className="govbb-fieldset">
      <legend className={labelClass("govbb-fieldset__legend")}>
        {field.label}
      </legend>
      {field.hint && (
        <p className="govbb-hint" id={hintId}>
          {field.hint}
        </p>
      )}
      <ErrorMessage id={errorId} message={errorMessage} />
      <div className="govbb-date-input">
        {parts.map(({ part, label, extra }) => (
          <div className="govbb-date-input__part" key={part}>
            <label
              className="govbb-date-input__label"
              htmlFor={`${field.id}-${part}`}
            >
              {label}
            </label>
            <div
              className={
                part === "year"
                  ? "govbb-date-input-wrapper govbb-date-input-wrapper--year"
                  : "govbb-date-input-wrapper"
              }
            >
              <input
                {...sharedProps}
                {...requiredProps}
                id={`${field.id}-${part}`}
                className="govbb-date-input__field"
                value={raw[part]}
                type="text"
                inputMode="numeric"
                {...extra}
                aria-invalid={invalid}
                onChange={(e) => handlePartChange(part)(e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export default function FieldRenderer({
  form,
  field,
  validationProperties,
  insetFieldsByOption,
  formId,
  formVersion,
}: {
  form: any;
  field: ClientPrimitive;
  validationProperties: FieldValidationProperties;
  /** Option-value → inset fields that reveal when that option is selected. */
  insetFieldsByOption?: Map<string, InsetFieldEntry[]>;
  /** Form ID, forwarded to FileUpload for analytics + presigned uploads. */
  formId?: string;
  /** Form version, forwarded to FileUpload for presigned uploads. */
  formVersion?: string;
}) {
  if (field.hidden) return null;

  let conditionalRequiredState: RequiredState = "unknownState";
  let fieldArray: FieldArrayBehaviour;

  const fieldConditionalOns = field.behaviours?.filter(
    (b) => b.type === "fieldConditionalOn",
  );

  const fieldArrays = field.behaviours?.filter((b) => b.type === "fieldArray");
  if (fieldArrays && fieldArrays.length >= 1) {
    fieldArray = fieldArrays[0];
  }

  if (fieldConditionalOns && fieldConditionalOns.length > 0) {
    conditionalRequiredState = checkConditionalOn(
      form.getFieldValue(field.id),
      fieldConditionalOns,
      form,
      field.stepId,
    );
  }

  if (conditionalRequiredState === "notRequired") {
    field.conditionallyHidden = true;
    return null;
  }

  // If the field was conditionally hidden before, but reaches here, then it's fine
  if (field.conditionallyHidden) field.conditionallyHidden = false;

  return (
    <form.Field name={field.id} validators={validationProperties}>
      {(f: AnyFieldApi) => {
        // For each field type, be sure to establish...
        // const value = f.state.value as ValueType | undefined
        let errorMessage = "";
        if (!f.state.meta.isValid) {
          errorMessage = f.state.meta.errors[0];
        }
        const invalid = errorMessage ? true : undefined;

        const hintId = field.hint ? `${field.id}-hint` : undefined;
        const errorId = errorMessage ? `${field.id}-error` : undefined;
        const describedBy =
          [hintId, errorId].filter(Boolean).join(" ") || undefined;

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

        switch (field.htmlType) {
          case "date": {
            return (
              <DateField
                f={f}
                field={field}
                labelClass={labelClass}
                sharedProps={sharedProps}
                requiredProps={requiredProps}
                invalid={invalid}
                errorId={errorId}
                errorMessage={errorMessage}
                hintId={hintId}
              />
            );
          }
          case "textarea": {
            let textareaElement: JSX.Element;

            if (!fieldArray) {
              const value = f.state.value as string | undefined;
              textareaElement = (
                <div
                  className="govbb-form-group"
                  data-field-width={field.ui?.width}
                >
                  <label
                    className={labelClass("govbb-label")}
                    htmlFor={field.id}
                  >
                    {field.label}
                  </label>
                  {field.hint && (
                    <p className="govbb-hint" id={hintId}>
                      {field.hint}
                    </p>
                  )}
                  <ErrorMessage id={errorId} message={errorMessage} />
                  <div className="govbb-input-wrapper">
                    <textarea
                      key={field.id}
                      {...sharedProps}
                      {...requiredProps}
                      className="govbb-textarea"
                      value={value ?? ""}
                      aria-invalid={invalid}
                      onChange={(e) => f.handleChange(e.target.value)}
                    />
                  </div>
                </div>
              );
              return textareaElement;
            }
          }
          case "text":
          case "number":
          case "tel":
          case "email": {
            let inputElement: JSX.Element;

            if (!fieldArray) {
              const value = f.state.value as string | undefined;
              inputElement = (
                <div className="govbb-input-wrapper">
                  <MaskedInput
                    key={field.id}
                    mask={field.mask}
                    {...sharedProps}
                    {...requiredProps}
                    className="govbb-input"
                    value={value ?? ""}
                    aria-invalid={invalid}
                    onChange={(e) => f.handleChange(e.target.value)}
                  />
                </div>
              );
            } else {
              const addAnotherField = (values: string[]) => {
                // Pushes a new empty field, that a user can fill in
                values.push("");
                f.handleChange(values);
              };

              const removeField = (values: string[]) => {
                values.pop();
                f.handleChange(values);
              };

              const updateField = (
                values: string[],
                index: number,
                value: string,
              ) => {
                values[index] = value;
                f.handleChange(values);
              };

              const values = (f.state.value as string[] | undefined) ?? [
                (field.defaultValue as string) ?? "",
              ];
              const min = fieldArray.min;
              const max = fieldArray.max;

              const fieldCount =
                values && values.length > 0
                  ? Math.min(values.length, max)
                  : min;

              inputElement = (
                <>
                  {Array.from({ length: fieldCount }).map((_, i) => (
                    <React.Fragment key={`${field.id}-${i}`}>
                      <div className="govbb-input-wrapper">
                        <MaskedInput
                          mask={field.mask}
                          {...sharedProps}
                          className="govbb-input"
                          value={values && values.length > 0 ? values[i] : ""}
                          aria-invalid={invalid}
                          onChange={(e) =>
                            updateField(values, i, e.target.value)
                          }
                        />
                      </div>
                      {i === fieldCount - 1 && i != 0 ? (
                        <button
                          type="button"
                          className="govbb-btn--destructive-link"
                          onClick={() => removeField(values)}
                        >
                          Remove{" "}
                          <span className="govbb-visually-hidden">
                            {field.label}
                          </span>
                        </button>
                      ) : null}
                    </React.Fragment>
                  ))}
                  {fieldCount < max ? (
                    <button
                      type="button"
                      className="govbb-btn--link"
                      onClick={() => addAnotherField(values)}
                    >
                      Add Another{" "}
                      <span className="govbb-visually-hidden">
                        {field.label}
                      </span>
                    </button>
                  ) : null}
                </>
              );
            }

            const element: JSX.Element = (
              <div
                className="govbb-form-group"
                data-field-width={field.ui?.width}
              >
                <label className={labelClass("govbb-label")} htmlFor={field.id}>
                  {field.label}
                </label>
                {field.hint && (
                  <p className="govbb-hint" id={hintId}>
                    {field.hint}
                  </p>
                )}
                <ErrorMessage id={errorId} message={errorMessage} />
                {inputElement}
              </div>
            );
            return element;
          }
          case "select":
            const isMultiple = field.multiple ?? false;
            const selectValue = f.state.value as string | string[] | undefined;
            return (
              <div
                className="govbb-form-group"
                data-field-width={field.ui?.width}
              >
                <label className={labelClass("govbb-label")} htmlFor={field.id}>
                  {field.label}
                </label>
                {field.hint && (
                  <p className="govbb-hint" id={hintId}>
                    {field.hint}
                  </p>
                )}
                <ErrorMessage id={errorId} message={errorMessage} />
                <div className="govbb-select-wrapper">
                  <select
                    {...sharedProps}
                    {...requiredProps}
                    className="govbb-select"
                    multiple={isMultiple}
                    value={selectValue ? selectValue : isMultiple ? [] : ""}
                    aria-invalid={invalid}
                    onChange={(e) => f.handleChange(e.target.value)}
                  >
                    <option value=""></option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="govbb-select__chevron" aria-hidden="true">
                    <svg viewBox="0 0 12 8">
                      <path d="M6 8 0 0h12z" />
                    </svg>
                  </span>
                </div>
              </div>
            );
          case "checkbox":
            if (field.options && field.options.length === 1) {
              const option = field.options[0];
              const value = (f.state.value as string | undefined) ?? "";
              return (
                <fieldset className="govbb-fieldset">
                  <legend className={labelClass("govbb-fieldset__legend")}>
                    {field.label}
                  </legend>
                  {field.hint && (
                    <p className="govbb-hint" id={hintId}>
                      {field.hint}
                    </p>
                  )}
                  <ErrorMessage id={errorId} message={errorMessage} />
                  <div className="form-page__options">
                    <div className="govbb-checkbox-item" key={option.value}>
                      <input
                        {...sharedProps}
                        {...requiredProps}
                        id={`${field.id}-${option.value}`}
                        className="govbb-checkbox"
                        checked={option.value === value}
                        aria-invalid={invalid}
                        onChange={() =>
                          f.handleChange(
                            option.value === value ? "" : option.value,
                          )
                        }
                      />
                      <label
                        className="govbb-checkbox-item__label"
                        htmlFor={`${field.id}-${option.value}`}
                      >
                        {option.label}
                      </label>
                    </div>
                  </div>
                </fieldset>
              );
            }

            const checkboxValues: string[] =
              (f.state.value as string[] | undefined) ?? [];

            const toggle = (item: string) => {
              const next = checkboxValues.includes(item)
                ? checkboxValues.filter((cv) => cv !== item)
                : [...checkboxValues, item];
              f.handleChange(next);
            };

            return (
              <fieldset className="govbb-fieldset">
                <legend className={labelClass("govbb-fieldset__legend")}>
                  {field.label}
                </legend>
                {field.hint && (
                  <p className="govbb-hint" id={hintId}>
                    {field.hint}
                  </p>
                )}
                <ErrorMessage id={errorId} message={errorMessage} />
                <div className="form-page__options">
                  {field.options?.map((option) => {
                    return (
                      <div className="govbb-checkbox-item" key={option.value}>
                        <input
                          {...sharedProps}
                          id={`${field.id}-${option.value}`}
                          className="govbb-checkbox"
                          checked={checkboxValues.includes(option.value)}
                          aria-invalid={invalid}
                          onChange={() => toggle(option.value)}
                        />
                        <label
                          className="govbb-checkbox-item__label"
                          htmlFor={`${field.id}-${option.value}`}
                        >
                          {option.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            );
          case "radio":
            const value: string = (f.state.value as string | undefined) ?? "";
            return (
              <fieldset className="govbb-fieldset">
                <legend className={labelClass("govbb-fieldset__legend")}>
                  {field.label}
                </legend>
                {field.hint && (
                  <p className="govbb-hint" id={hintId}>
                    {field.hint}
                  </p>
                )}
                <ErrorMessage id={errorId} message={errorMessage} />
                <div className="form-page__options">
                  {field.options?.map((option) => {
                    const insetEntries = insetFieldsByOption?.get(option.value);
                    const isSelected = option.value === value;
                    return (
                      <React.Fragment key={option.value}>
                        <div className="govbb-radio-item">
                          <input
                            {...sharedProps}
                            {...requiredProps}
                            id={`${field.id}-${option.value}`}
                            className="govbb-radio"
                            checked={isSelected}
                            aria-invalid={invalid}
                            onChange={() => f.handleChange(option.value)}
                          />
                          <label
                            className="govbb-radio-item__label"
                            htmlFor={`${field.id}-${option.value}`}
                          >
                            {option.label}
                          </label>
                        </div>
                        {/* Conditional reveal: inset fields shown below the
                            selected option. Rendered as a sibling immediately
                            after the radio item so the govbb
                            `:has(:checked) + __conditional` styling applies. */}
                        {insetEntries && isSelected && (
                          <div className="govbb-radio-item__conditional">
                            {insetEntries.map(
                              ({
                                field: insetField,
                                validationProperties: insetValidation,
                              }) => (
                                <FieldRenderer
                                  key={insetField.id}
                                  form={form}
                                  field={insetField}
                                  validationProperties={insetValidation}
                                  formId={formId}
                                />
                              ),
                            )}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </fieldset>
            );
          case "file":
            return (
              <FileUpload
                field={field}
                sharedProps={sharedProps}
                value={f.state.value as UploadedFile[] | null | undefined}
                onFileChange={(files) => f.handleChange(files)}
                errorMessage={errorMessage}
                errorId={errorId}
                validationRules={field.validations}
                formId={formId}
                formVersion={formVersion}
              />
            );
          case "show-hide": {
            // Value is a boolean: false = collapsed (default), true = expanded.
            // The toggle itself carries no validation. Hint text and controlled
            // sibling fields are rendered by form-renderer inside a shared
            // form-page__show-hide-content wrapper so the left border spans
            // them all. The govbb show-hide component is <details>-based, so the
            // controlled-toggle visual is hand-rolled from brand tokens.
            const isOpen = (f.state.value as boolean | undefined) ?? false;
            return (
              <div className="form-page__show-hide">
                <button
                  type="button"
                  className="form-page__show-hide-toggle"
                  aria-expanded={isOpen}
                  onClick={() => f.handleChange(!isOpen)}
                >
                  <span
                    className="form-page__show-hide-arrow"
                    aria-hidden="true"
                  />
                  {field.label}
                </button>
              </div>
            );
          }
          default:
            return (
              <div style={{ color: "red" }}>
                No field for {field.htmlType} designed
              </div>
            );
        }
      }}
    </form.Field>
  );
}
