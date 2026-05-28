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
        const sharedProps = {
          type: field.htmlType,
          name: field.name,
          id: field.id,
          disabled: field.disabled,
          placeholder: field.placeholder,
          onBlur: f.handleBlur,
        };

        // Surface required state to assistive tech. Not spread onto multi-option
        // checkbox inputs — there it would force every box to be checked.
        const isRequired = field.validations?.required?.value === true;
        const requiredProps = isRequired
          ? { required: true, "aria-required": true }
          : {};

        let errorMessage = "";
        if (!f.state.meta.isValid) {
          errorMessage = f.state.meta.errors[0];
        }

        switch (field.htmlType) {
          case "date": {
            const value = f.state.value as DateValue | undefined;
            return (
              <fieldset data-field data-date-field>
                <legend>{field.label}</legend>
                {field.hint && <p data-hint>{field.hint}</p>}
                <ErrorMessage message={errorMessage} />
                <div data-date-group>
                  <div data-date-part>
                    <label htmlFor={`${field.id}-day`}>Day</label>
                    <input
                      {...sharedProps}
                      {...requiredProps}
                      id={`${field.id}-day`}
                      value={value?.day ?? ""}
                      type="number"
                      min={1}
                      max={31}
                      onChange={(e) => {
                        const day = Number(e.target.value) ?? undefined;
                        f.handleChange({
                          ...value,
                          day,
                        });
                      }}
                    />
                  </div>

                  <div data-date-part>
                    <label htmlFor={`${field.id}-month`}>Month</label>
                    <input
                      {...sharedProps}
                      {...requiredProps}
                      id={`${field.id}-month`}
                      type="number"
                      value={value?.month ?? ""}
                      min={1}
                      max={12}
                      onChange={(e) => {
                        const month = Number(e.target.value) ?? undefined;
                        f.handleChange({
                          ...value,
                          month,
                        });
                      }}
                    />
                  </div>

                  <div data-date-part>
                    <label htmlFor={`${field.id}-year`}>Year</label>
                    <input
                      {...sharedProps}
                      {...requiredProps}
                      id={`${field.id}-year`}
                      type="number"
                      value={value?.year ?? ""}
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
              </fieldset>
            );
          }
          case "textarea": {
            let textareaElement: JSX.Element;

            if (!fieldArray) {
              const value = f.state.value as string | undefined;
              textareaElement = (
                <div data-field data-field-width={field.ui?.width}>
                  <label htmlFor={field.id}> {field.label} </label>
                  {field.hint && <p data-hint>{field.hint}</p>}
                  <textarea
                    key={field.id}
                    {...sharedProps}
                    {...requiredProps}
                    value={value ?? ""}
                    onChange={(e) => f.handleChange(e.target.value)}
                  />
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
                <MaskedInput
                  key={field.id}
                  mask={field.mask}
                  {...sharedProps}
                  {...requiredProps}
                  value={value ?? ""}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
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
                      <MaskedInput
                        mask={field.mask}
                        {...sharedProps}
                        value={values && values.length > 0 ? values[i] : ""}
                        onChange={(e) => updateField(values, i, e.target.value)}
                      />
                      {i === fieldCount - 1 && i != 0 ? (
                        <p onClick={() => removeField(values)}> Remove </p>
                      ) : null}
                    </React.Fragment>
                  ))}
                  {fieldCount < max ? (
                    <p onClick={() => addAnotherField(values)}>Add Another</p>
                  ) : null}
                </>
              );
            }

            const element: JSX.Element = (
              <div data-field data-field-width={field.ui?.width}>
                <div>
                  <label htmlFor={field.id}> {field.label} </label>
                  {field.hint && <p data-hint>{field.hint}</p>}
                  <ErrorMessage message={errorMessage} />
                </div>
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
                data-field
                data-select-field
                data-field-width={field.ui?.width}
              >
                <label htmlFor={field.id}> {field.label} </label>
                {field.hint && <p data-hint>{field.hint}</p>}
                <ErrorMessage message={errorMessage} />
                <div data-select-control>
                  <select
                    {...sharedProps}
                    {...requiredProps}
                    multiple={isMultiple}
                    value={selectValue ? selectValue : isMultiple ? [] : ""}
                    onChange={(e) => f.handleChange(e.target.value)}
                  >
                    <option value=""></option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          case "checkbox":
            if (field.options && field.options.length === 1) {
              const option = field.options[0];
              const value = (f.state.value as string | undefined) ?? "";
              return (
                <fieldset data-checkbox-group>
                  <legend>{field.label}</legend>
                  {field.hint && <p data-hint>{field.hint}</p>}
                  <ErrorMessage message={errorMessage} />
                  <div key={option.value} data-checkbox-option>
                    <label htmlFor={`${field.id}-${option.value}`}>
                      <input
                        {...sharedProps}
                        {...requiredProps}
                        id={`${field.id}-${option.value}`}
                        checked={option.value === value}
                        onChange={() =>
                          f.handleChange(
                            option.value === value ? "" : option.value,
                          )
                        }
                      />
                      {option.label}
                    </label>
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
              <fieldset data-fieldset>
                <div>
                  <legend>{field.label}</legend>
                  {field.hint && <p data-hint>{field.hint}</p>}
                  <ErrorMessage message={errorMessage} />
                </div>
                <div data-checkbox-group>
                  {field.options?.map((option) => {
                    return (
                      <div key={option.value} data-checkbox-option>
                        <label htmlFor={`${field.id}-${option.value}`}>
                          <input
                            {...sharedProps}
                            id={`${field.id}-${option.value}`}
                            checked={checkboxValues.includes(option.value)}
                            onChange={() => toggle(option.value)}
                          />
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
              <fieldset data-fieldset>
                <legend>{field.label}</legend>
                {field.hint && <p data-hint>{field.hint}</p>}
                <ErrorMessage message={errorMessage} />
                <div data-radio-group>
                  {field.options?.map((option) => {
                    const insetEntries = insetFieldsByOption?.get(option.value);
                    const isSelected = option.value === value;
                    return (
                      <div key={option.value} data-radio-item>
                        <input
                          {...sharedProps}
                          {...requiredProps}
                          id={`${field.id}-${option.value}`}
                          checked={isSelected}
                          onChange={() => f.handleChange(option.value)}
                        />
                        <label htmlFor={`${field.id}-${option.value}`}>
                          {option.label}
                        </label>
                        {/* Conditional reveal: inset fields shown below the
                            selected option with an indented left-border style */}
                        {insetEntries && isSelected && (
                          <div data-radio-conditional>
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
                      </div>
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
                validationRules={field.validations}
                formId={formId}
              />
            );
          case "show-hide": {
            // Value is a boolean: false = collapsed (default), true = expanded.
            // The toggle itself carries no validation. Hint text and controlled
            // sibling fields are rendered by form-renderer inside a shared
            // data-show-hide-content wrapper so the left border spans them all.
            const isOpen = (f.state.value as boolean | undefined) ?? false;
            return (
              <div data-show-hide>
                <button
                  type="button"
                  data-show-hide-toggle
                  aria-expanded={isOpen}
                  onClick={() => f.handleChange(!isOpen)}
                >
                  <span data-show-hide-arrow aria-hidden="true" />
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
