import { JSX } from "react";
import { FormGroup, Hint, Label, Select } from "@govtech-bb/react";
import ErrorMessage from "../error-message";
import { FieldRenderContext } from "./render-context";
import FieldRenderer from "./index";

export function renderSelectField(ctx: FieldRenderContext): JSX.Element {
  const {
    field,
    form,
    f,
    sharedProps,
    requiredProps,
    invalid,
    hintId,
    errorId,
    errorMessage,
    labelSuffix,
    commitChange,
    insetFieldsByOption,
    formId,
    previewToken,
    draftToken,
  } = ctx;

  const selectValue = f.state.value as string | undefined;
  // Conditional reveal (#863): inset fields keyed to the selected
  // option. Unlike radio there is no per-option DOM position, so
  // the reveal renders below the whole control.
  const selectInsetEntries =
    typeof selectValue === "string"
      ? insetFieldsByOption?.get(selectValue)
      : undefined;
  return (
    <FormGroup data-field-width={field.ui?.width}>
      <Label
        className={field.ui?.hideLabel ? "govbb-visually-hidden" : undefined}
        htmlFor={field.id}
        optional={labelSuffix !== null}
      >
        {field.label}
      </Label>
      {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
      <ErrorMessage id={errorId} message={errorMessage} />
      <Select
        {...sharedProps}
        {...requiredProps}
        value={selectValue ?? ""}
        aria-invalid={invalid}
        onChange={(e) => commitChange(e.target.value)}
      >
        <option value=""></option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {selectInsetEntries && (
        <div className="govbb-select__conditional">
          {selectInsetEntries.map(
            ({
              field: insetField,
              validationProperties: insetValidation,
              insetFieldsByOption: nestedInsets,
            }) => (
              <FieldRenderer
                key={insetField.id}
                form={form}
                field={insetField}
                validationProperties={insetValidation}
                insetFieldsByOption={nestedInsets}
                formId={formId}
                previewToken={previewToken}
                draftToken={draftToken}
              />
            ),
          )}
        </div>
      )}
    </FormGroup>
  );
}
