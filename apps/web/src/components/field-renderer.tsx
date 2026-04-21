import { AnyFieldApi } from "@tanstack/react-form";
import { ClientPrimitive, FieldValidationProperties } from "@web/types";
import React from "react";

export default function FieldRenderer({
  form,
  field,
  validationProperties,
}: {
  form: any;
  field: ClientPrimitive;
  validationProperties: FieldValidationProperties;
}) {
  if (field.hidden) return null;

  return (
    <form.Field name={field.id} validators={validationProperties}>
      {(f: AnyFieldApi) => {
        const value = f.state.value;

        const sharedProps = {
          type: field.htmlType,
          name: field.id,
          id: field.id,
          disabled: field.disabled,
          placeholder: field.placeholder,
          onBlur: f.handleBlur,
        };

        switch (field.htmlType) {
          case "date": {
            return (
              <fieldset data-field data-date-field>
                <legend>{field.label}</legend>
                <div data-date-group>
                  <div data-date-part>
                    <label>Day</label>
                    <input />
                  </div>

                  <div data-date-part>
                    <label>Month</label>
                    <input />
                  </div>

                  <div data-date-part>
                    <label>Year</label>
                    <input />
                  </div>
                </div>
              </fieldset>
            );
          }
          case "text":
          case "textarea":
          case "number":
          case "tel":
          case "email":
            return (
              <div data-field>
                {!f.state.meta.isValid && (
                  <em role="alert">{f.state.meta.errors.join(", ")}</em>
                )}
                <label> {field.label} </label>
                <input
                  {...sharedProps}
                  value={value ?? ""}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </div>
            );
          case "select":
            return (
              <div data-field data-select-field>
                <label> {field.label} </label>
                <div data-select-control>
                  <select {...sharedProps} multiple={field.multiple ?? false} onChange={(e) => f.handleChange(e.target.value)}>
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
              return (
                <div data-checkbox-group>
                  {!f.state.meta.isValid && (
                    <em role="alert">{f.state.meta.errors.join(", ")}</em>
                  )}
                  <legend>{field.label}</legend>
                  <div key={option.value} data-checkbox-option>
                    <input
                      {...sharedProps}
                      checked={value ?? false}
                      value={option.value}
                      onChange={(e) => {
                        f.handleChange(e.target.checked)
                      }}
                    />
                    <label>{option.label}</label>
                  </div>
                </div>
              );
            }

            const checkboxValues: string[] = value ?? [];
            const toggle = (item: string) => {
              const next = checkboxValues.includes(item)
                ? checkboxValues.filter((cv) => cv !== item)
                : [...checkboxValues, item];
              f.handleChange(next);
            };

            return (
              <fieldset data-fieldset>
                {!f.state.meta.isValid && (
                  <em role="alert">{f.state.meta.errors.join(", ")}</em>
                )}
                <legend>{field.label}</legend>
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
            return (
              <fieldset data-fieldset>
                <legend>{field.label}</legend>
                <div data-radio-group>
                  {field.options?.map((option) => (
                    <div key={option.value} data-radio-item>
                      <input {...sharedProps} />
                      <label>{option.label}</label>
                    </div>
                  ))}
                </div>
              </fieldset>
            );
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
