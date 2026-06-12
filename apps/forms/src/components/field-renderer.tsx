import { AnyFieldApi } from "@tanstack/react-form";
import {
  ClientPrimitive,
  FieldValidationProperties,
  UploadedFile,
} from "@forms/types";
import React, { JSX } from "react";
import ErrorMessage from "./error-message";
import { RequiredState, checkConditionalOn, parseDatePart } from "@forms/lib";
import { DateValue, FieldArrayBehaviour } from "@govtech-bb/form-types";
import { isDateValidationError } from "@govtech-bb/form-validation";
import type {
  DatePart,
  DateValidationError,
} from "@govtech-bb/form-validation";
import FileUpload from "./file-upload";
import { MaskedInput } from "./masked-input";

/** An inset field entry passed from the parent radio/select group. */
export interface InsetFieldEntry {
  field: ClientPrimitive;
  validationProperties: FieldValidationProperties;
}

/**
 * Design-system number input. A native `type="number"` field with the browser
 * spinners suppressed (`.govbb-number-input`) plus custom up/down steppers that
 * match the gov bb design system. The stepper arrows are drawn entirely in CSS,
 * so the buttons carry no visible content. Increment/decrement step the
 * controlled value by 1; a blank/non-numeric value is treated as 0.
 */
function NumberInput({
  value,
  onChange,
  invalid,
  inputProps,
}: {
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const step = (delta: number) => {
    const current = Number(value);
    const base = value !== "" && Number.isFinite(current) ? current : 0;
    onChange(String(base + delta));
  };

  return (
    <div className="govbb-number-input-wrapper">
      <input
        {...inputProps}
        type="number"
        inputMode="numeric"
        className="govbb-number-input"
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="govbb-number-input__steppers">
        <button
          type="button"
          tabIndex={-1}
          className="govbb-number-input__step"
          aria-label="Increment"
          aria-controls={inputProps.id}
          disabled={inputProps.disabled}
          onClick={() => step(1)}
        />
        <div className="govbb-number-input__divider" />
        <button
          type="button"
          tabIndex={-1}
          className="govbb-number-input__step govbb-number-input__step--down"
          aria-label="Decrement"
          aria-controls={inputProps.id}
          disabled={inputProps.disabled}
          onClick={() => step(-1)}
        />
      </div>
    </div>
  );
}

export default function FieldRenderer({
  form,
  field,
  validationProperties,
  insetFieldsByOption,
  formId,
  formVersion,
  previewToken,
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
  /** Preview token, forwarded to FileUpload so draft uploads resolve. */
  previewToken?: string;
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
          invalid && (dateError?.parts.includes(part) ?? true)
            ? true
            : undefined;

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

        // GOV.UK telephone pattern: phone inputs carry autocomplete="tel" so
        // the browser can autofill a saved number (WCAG 2.2 SC 1.3.5).
        const autoComplete = field.htmlType === "tel" ? "tel" : undefined;

        switch (field.htmlType) {
          case "date": {
            const value = f.state.value as DateValue | undefined;
            // The fieldset id is the ErrorSummary anchor target; the error is
            // described at the group level per the GOV.UK date input markup.
            return (
              <fieldset
                className="govbb-fieldset"
                id={field.id}
                role="group"
                aria-describedby={describedBy}
              >
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
                  <div className="govbb-date-input__part">
                    <label
                      className="govbb-date-input__label"
                      htmlFor={`${field.id}-day`}
                    >
                      Day
                    </label>
                    <div className="govbb-date-input-wrapper">
                      <input
                        {...sharedProps}
                        {...requiredProps}
                        id={`${field.id}-day`}
                        name={`${field.name}-day`}
                        className="govbb-date-input__field"
                        value={value?.day ?? ""}
                        type="text"
                        inputMode="numeric"
                        // undefined overrides sharedProps — the group carries
                        // the description, double announcements are noise
                        aria-describedby={undefined}
                        aria-invalid={partInvalid("day")}
                        onChange={(e) => {
                          commitChange({
                            ...value,
                            day: parseDatePart(e.target.value),
                          });
                        }}
                      />
                    </div>
                  </div>

                  <div className="govbb-date-input__part">
                    <label
                      className="govbb-date-input__label"
                      htmlFor={`${field.id}-month`}
                    >
                      Month
                    </label>
                    <div className="govbb-date-input-wrapper">
                      <input
                        {...sharedProps}
                        {...requiredProps}
                        id={`${field.id}-month`}
                        name={`${field.name}-month`}
                        className="govbb-date-input__field"
                        type="text"
                        inputMode="numeric"
                        value={value?.month ?? ""}
                        aria-describedby={undefined}
                        aria-invalid={partInvalid("month")}
                        onChange={(e) => {
                          commitChange({
                            ...value,
                            month: parseDatePart(e.target.value),
                          });
                        }}
                      />
                    </div>
                  </div>

                  <div className="govbb-date-input__part">
                    <label
                      className="govbb-date-input__label"
                      htmlFor={`${field.id}-year`}
                    >
                      Year
                    </label>
                    <div className="govbb-date-input-wrapper govbb-date-input-wrapper--year">
                      <input
                        {...sharedProps}
                        {...requiredProps}
                        id={`${field.id}-year`}
                        name={`${field.name}-year`}
                        className="govbb-date-input__field"
                        type="text"
                        inputMode="numeric"
                        value={value?.year ?? ""}
                        aria-describedby={undefined}
                        aria-invalid={partInvalid("year")}
                        onChange={(e) => {
                          commitChange({
                            ...value,
                            year: parseDatePart(e.target.value),
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </fieldset>
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
                      onChange={(e) => commitChange(e.target.value)}
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
            const isNumber = field.htmlType === "number";

            // Number fields render the design-system number input (custom
            // steppers, native spinners hidden); the other text-like types keep
            // the masked `.govbb-input`. `withRequired` mirrors the original
            // behaviour where the repeating array path omits requiredProps.
            const renderControl = (
              value: string,
              onChange: (next: string) => void,
              withRequired: boolean,
            ): JSX.Element =>
              isNumber ? (
                <NumberInput
                  value={value}
                  onChange={onChange}
                  invalid={invalid}
                  inputProps={
                    withRequired
                      ? { ...sharedProps, ...requiredProps }
                      : sharedProps
                  }
                />
              ) : (
                <div className="govbb-input-wrapper">
                  <MaskedInput
                    key={field.id}
                    mask={field.mask}
                    {...sharedProps}
                    {...(withRequired ? requiredProps : {})}
                    autoComplete={autoComplete}
                    className="govbb-input"
                    value={value}
                    aria-invalid={invalid}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </div>
              );

            if (!fieldArray) {
              const value = f.state.value as string | undefined;
              inputElement = renderControl(
                value ?? "",
                (next) => commitChange(next),
                true,
              );
            } else {
              // Immutable updates: TanStack's store dedupes by reference, so a
              // mutated-in-place array passed back to handleChange can be
              // dropped as "unchanged". Always commit a fresh array.
              const addAnotherField = (values: string[]) => {
                commitChange([...values, ""]);
              };

              const removeField = (values: string[]) => {
                commitChange(values.slice(0, -1));
              };

              const updateField = (
                values: string[],
                index: number,
                value: string,
              ) => {
                const next = [...values];
                next[index] = value;
                commitChange(next);
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
                      {renderControl(
                        values && values.length > 0 ? values[i] : "",
                        (next) => updateField(values, i, next),
                        false,
                      )}
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
          case "select": {
            const isMultiple = field.multiple ?? false;
            const selectValue = f.state.value as string | string[] | undefined;
            // Conditional reveal (#863): inset fields keyed to the selected
            // option. Unlike radio there is no per-option DOM position, so
            // the reveal renders below the whole control. Multi-selects never
            // receive insetFieldsByOption (see buildFieldGroups).
            const selectInsetEntries =
              !isMultiple && typeof selectValue === "string"
                ? insetFieldsByOption?.get(selectValue)
                : undefined;
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
                    onChange={(e) => commitChange(e.target.value)}
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
                      <path d="M0 8 6 0 12 8z" />
                    </svg>
                  </span>
                </div>
                {selectInsetEntries && (
                  <div className="govbb-select__conditional">
                    {selectInsetEntries.map(
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
                          formVersion={formVersion}
                          previewToken={previewToken}
                        />
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          }
          case "checkbox":
            if (field.options && field.options.length === 1) {
              const option = field.options[0];
              const value = (f.state.value as string | undefined) ?? "";
              return (
                <fieldset className="govbb-fieldset" id={field.id}>
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
                          commitChange(
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
              commitChange(next);
            };

            return (
              <fieldset className="govbb-fieldset" id={field.id}>
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
              <fieldset className="govbb-fieldset" id={field.id}>
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
                            onChange={() => commitChange(option.value)}
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
                                  formVersion={formVersion}
                                  previewToken={previewToken}
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
                onFileChange={(files) => commitChange(files)}
                errorMessage={errorMessage}
                errorId={errorId}
                formId={formId}
                formVersion={formVersion}
                previewToken={previewToken}
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
                  onClick={() => commitChange(!isOpen)}
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
