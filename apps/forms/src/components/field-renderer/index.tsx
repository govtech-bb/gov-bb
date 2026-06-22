import { AnyFieldApi } from "@tanstack/react-form";
import {
  ClientPrimitive,
  FieldValidationProperties,
  UploadedFile,
} from "@forms/types";
import { RequiredState, checkConditionalOn } from "@forms/lib";
import { FieldArrayBehaviour } from "@govtech-bb/form-types";
import FileUpload from "../file-upload";
import { buildFieldRenderContext, InsetFieldEntry } from "./render-context";
import { renderDateField } from "./date-field";
import { renderTextField } from "./text-field";
import { renderTextareaField } from "./textarea-field";
import { renderSelectField } from "./select-field";
import { renderCheckboxField } from "./checkbox-field";
import { renderRadioField } from "./radio-field";
import { renderShowHideField } from "./show-hide-field";

export type { InsetFieldEntry };

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
        const ctx = buildFieldRenderContext({
          field,
          form,
          f,
          fieldArray,
          insetFieldsByOption,
          formId,
          formVersion,
          previewToken,
        });

        switch (field.htmlType) {
          case "date":
            return renderDateField(ctx);
          case "textarea":
            return renderTextareaField(ctx);
          case "text":
          case "number":
          case "tel":
          case "email":
            return renderTextField(ctx);
          case "select":
            return renderSelectField(ctx);
          case "checkbox":
            return renderCheckboxField(ctx);
          case "radio":
            return renderRadioField(ctx);
          case "file":
            return (
              <FileUpload
                field={field}
                sharedProps={ctx.sharedProps}
                value={f.state.value as UploadedFile[] | null | undefined}
                onFileChange={(files) => ctx.commitChange(files)}
                errorMessage={ctx.errorMessage}
                errorId={ctx.errorId}
                formId={formId}
                formVersion={formVersion}
                previewToken={previewToken}
              />
            );
          case "show-hide":
            return renderShowHideField(ctx);
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
