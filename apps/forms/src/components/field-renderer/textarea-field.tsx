import { JSX } from "react";
import ErrorMessage from "../error-message";
import { renderRepeatableOrSingle, rowInputProps } from "./repeatable-field";
import { FieldRenderContext } from "./render-context";

export function renderTextareaField(ctx: FieldRenderContext): JSX.Element {
  const {
    field,
    sharedProps,
    requiredProps,
    invalid,
    hintId,
    errorId,
    errorMessage,
    labelClass,
  } = ctx;

  // `withRequired` mirrors the text path: the repeating-array variant
  // omits requiredProps so a half-filled repeat isn't flagged.
  const renderTextarea = (
    value: string,
    onChange: (next: string) => void,
    withRequired: boolean,
    index?: number,
  ): JSX.Element => {
    const props = rowInputProps(sharedProps, field, index);
    return (
      <div className="govbb-input-wrapper">
        <textarea
          key={props.id}
          {...props}
          {...(withRequired ? requiredProps : {})}
          className="govbb-textarea"
          value={value}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  };

  const textareaElement = renderRepeatableOrSingle(ctx, renderTextarea);

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
      {textareaElement}
    </div>
  );
}
