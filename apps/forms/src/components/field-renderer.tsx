import { AnyFieldApi } from "@tanstack/react-form";
import { ClientPrimitive, FieldValidationProperties } from "@forms/types";
import React, { JSX } from "react";
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

export default function FieldRenderer({
  form,
  field,
  validationProperties,
  insetFieldsByOption,
  formId,
}: {
  form: any;
  field: ClientPrimitive;
  validationProperties: FieldValidationProperties;
  /** Option-value → inset fields that reveal when that option is selected. */
  insetFieldsByOption?: Map<string, InsetFieldEntry[]>;
  /** Form ID, forwarded to FileUpload for analytics event payload. */
  formId?: string;
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
            const value = f.state.value as DateValue | undefined;
            return (
              <fieldset className="govbb-fieldset">
                <legend className="govbb-fieldset__legend">
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
                        className="govbb-date-input__field"
                        value={value?.day ?? ""}
                        type="number"
                        min={1}
                        max={31}
                        aria-invalid={invalid}
                        onChange={(e) => {
                          const day = Number(e.target.value) ?? undefined;
                          f.handleChange({
                            ...value,
                            day,
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
                        className="govbb-date-input__field"
                        type="number"
                        value={value?.month ?? ""}
                        min={1}
                        max={12}
                        aria-invalid={invalid}
                        onChange={(e) => {
                          const month = Number(e.target.value) ?? undefined;
                          f.handleChange({
                            ...value,
                            month,
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
                        className="govbb-date-input__field"
                        type="number"
                        value={value?.year ?? ""}
                        aria-invalid={invalid}
                        onChange={(e) => {
                          const year = Number(e.target.value) ?? undefined;
                          f.handleChange({
                            ...value,
                            year,
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
                  <label className="govbb-label" htmlFor={field.id}>
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
                <label className="govbb-label" htmlFor={field.id}>
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
                <label className="govbb-label" htmlFor={field.id}>
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
                  <legend className="govbb-fieldset__legend">
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
                <legend className="govbb-fieldset__legend">
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
                <legend className="govbb-fieldset__legend">
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
                value={f.state.value as File[] | null | undefined}
                onFileChange={(files) => f.handleChange(files)}
                errorMessage={errorMessage}
                errorId={errorId}
                validationRules={field.validations}
                formId={formId}
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
