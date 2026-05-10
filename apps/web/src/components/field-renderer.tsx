import { AnyFieldApi } from "@tanstack/react-form";
import { ClientPrimitive, FieldValidationProperties } from "@web/types";
import React, { JSX } from "react";
import ErrorMessage from "./error-message";
import { RequiredState, checkConditionalOn } from "@web/lib";
import { DateValue, FieldArrayBehaviour } from "@govtech-bb/form-types";
import FileUpload from "./file-upload";

export default function FieldRenderer({
  form,
  field,
  validationProperties,
  hiddenFieldsRef,
}: {
  form: any;
  field: ClientPrimitive;
  validationProperties: FieldValidationProperties;
  hiddenFieldsRef: React.MutableRefObject<string[]>;
}) {
  if (field.hidden) {
    if (!hiddenFieldsRef.current.includes(field.id))
      hiddenFieldsRef.current.push(field.id);
    return null;
  }

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
    if (!hiddenFieldsRef.current.includes(field.id))
      hiddenFieldsRef.current.push(field.id);
    return null;
  }

  if (hiddenFieldsRef.current.includes(field.id)) {
    const index = hiddenFieldsRef.current.findIndex(
      (fieldId) => field.id === fieldId,
    );
    if (index > -1) hiddenFieldsRef.current.splice(index, 1);
  }

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
                    <label>Day</label>
                    <input
                      {...sharedProps}
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
                    <label>Month</label>
                    <input
                      {...sharedProps}
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
                    <label>Year</label>
                    <input
                      {...sharedProps}
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
                  <label> {field.label} </label>
                  {field.hint && <p data-hint>{field.hint}</p>}
                  <textarea
                    key={field.id}
                    {...sharedProps}
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
                <input
                  key={field.id}
                  {...sharedProps}
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
                      <input
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
                  <label> {field.label} </label>
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
                <label> {field.label} </label>
                {field.hint && <p data-hint>{field.hint}</p>}
                <ErrorMessage message={errorMessage} />
                <div data-select-control>
                  <select
                    {...sharedProps}
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
                <div data-checkbox-group>
                  <div>
                    <legend>{field.label}</legend>
                    {field.hint && <p data-hint>{field.hint}</p>}
                    <ErrorMessage message={errorMessage} />
                  </div>
                  <div key={option.value} data-checkbox-option>
                    <input
                      {...sharedProps}
                      checked={option.value === value}
                      onChange={() =>
                        f.handleChange(
                          option.value === value ? "" : option.value,
                        )
                      }
                    />
                    <label>{option.label}</label>
                  </div>
                </div>
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
                        <input
                          {...sharedProps}
                          checked={checkboxValues.includes(option.value)}
                          onChange={() => toggle(option.value)}
                        />
                        <label>{option.label}</label>
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
                  {field.options?.map((option) => (
                    <div key={option.value} data-radio-item>
                      <input
                        {...sharedProps}
                        checked={option.value === value ? true : false}
                        onChange={() => f.handleChange(option.value)}
                      />
                      <label>{option.label}</label>
                    </div>
                  ))}
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
