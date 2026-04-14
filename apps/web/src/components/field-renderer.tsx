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
          case "text":
          case "textarea":
          case "number":
          case "tel":
          case "email":
            return (
              <div>
                <label> {field.label} </label>
                <input {...sharedProps} />
              </div>
            );
          default:
            return <div>No field for {field.htmlType} designed</div>;
        }
      }}
    />
  );
}
