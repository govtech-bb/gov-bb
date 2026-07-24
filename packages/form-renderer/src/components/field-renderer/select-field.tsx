import { JSX } from "react";
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
    labelClass,
    commitChange,
    insetFieldsByOption,
    formId,
    previewToken,
    draftToken,
  } = ctx;

  const isMultiple = field.multiple ?? false;
  const selectValue = f.state.value as string | string[] | undefined;
  // Conditional reveal (#863): inset fields keyed to the selected
  // option. Unlike radio there is no per-option DOM position, so
  // the reveal renders below the whole control. Multi-selects never
  // receive insetFieldsByOption (see buildFieldGroups).
  const selectInsetEntries =
    !isMultiple && typeof selectValue === "string"
      ? insetFieldsByOption?.get(selectValue)
      : undefined;
  return (
    <div className="govbb-form-group" data-field-width={field.ui?.width}>
      <label className={labelClass("govbb-label")} htmlFor={field.id}>
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
          onChange={(e) => commitChange(e.target.value)}
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
            <path d="M0 8 6 0 12 8z" />
          </svg>
        </span>
      </div>
      {selectInsetEntries && (
        <div className="govbb-select__conditional">
          {selectInsetEntries.map(
            ({ field: insetField, validationProperties: insetValidation }) => (
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
    </div>
  );
}
