import React, { JSX } from "react";
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
    commitChange,
    insetFieldsByOption,
    formId,
    previewToken,
    draftToken,
  } = ctx;

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
                        previewToken={previewToken}
                        draftToken={draftToken}
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
}
