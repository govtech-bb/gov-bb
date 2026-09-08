import { JSX } from "react";
import { Fieldset, Hint, Radio } from "@govtech-bb/react";
import ErrorMessage from "../error-message";
import { FieldRenderContext } from "./render-context";
import FieldRenderer from "./index";

export function renderRadioField(ctx: FieldRenderContext): JSX.Element {
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
    labelClass,
    labelSuffix,
    commitChange,
    insetFieldsByOption,
    formId,
    previewToken,
    draftToken,
  } = ctx;

  // Keep the field ID on the fieldset; let the package generate option IDs.
  const { id: _fieldId, ...inputProps } = sharedProps;

  const value: string = (f.state.value as string | undefined) ?? "";
  return (
    <Fieldset className="form-page__choice-field" id={field.id}>
      <legend className={labelClass("govbb-fieldset__legend")}>
        {field.label}
        {labelSuffix}
      </legend>
      {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
      <ErrorMessage id={errorId} message={errorMessage} />
      {field.options?.map((option) => {
        const insetEntries = insetFieldsByOption?.get(option.value);
        const isSelected = option.value === value;
        return (
          <Radio
            key={option.value}
            {...inputProps}
            {...requiredProps}
            label={option.label}
            checked={isSelected}
            aria-invalid={invalid}
            onChange={() => commitChange(option.value)}
            conditional={
              insetEntries && isSelected
                ? insetEntries.map(
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
                  )
                : undefined
            }
          />
        );
      })}
    </Fieldset>
  );
}
