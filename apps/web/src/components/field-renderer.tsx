"use client";
import { ClientPrimitive } from "@web/types";

export default function FieldRenderer({
  form,
  field,
}: {
  form: any;
  field: ClientPrimitive;
}) {
  if (field.hidden) return null;

  return (
    <form.Field
      name={field.id}
      children={(f: any) => {
        const value = f.state.value;

        const sharedProps = {
          type: field.htmlType,
          name: field.id,
          disabled: field.disabled,
          placeholder: field.placeholder,
          value: value ?? undefined,
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
                <label> {field.label} </label>
                <input {...sharedProps} />
              </div>
            );
          case "select":
            return (
              <div data-field data-select-field>
                <label> {field.label} </label>
                <div data-select-control>
                  <select {...sharedProps}>
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
            return (
              <fieldset data-field>
                <legend>{field.label}</legend>
                <div data-checkbox-group>
                  {field.options?.map((option) => (
                    <div key={option.value} data-checkbox-option>
                      <input type="checkbox" />
                      <label>{option.label}</label>
                    </div>
                  ))}
                </div>
              </fieldset>
            );
          default:
            return <div style={{ color: "red" }}>No field for {field.htmlType} designed</div>;
        }
      }}
    />
  );
}
