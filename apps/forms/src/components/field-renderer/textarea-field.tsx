import { JSX } from "react";
import { FormGroup, Hint, Label, TextArea } from "@govtech-bb/react";
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
    labelSuffix,
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
      <TextArea
        key={props.id}
        {...props}
        {...(withRequired ? requiredProps : {})}
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  const textareaElement = renderRepeatableOrSingle(ctx, renderTextarea);

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
      {textareaElement}
    </FormGroup>
  );
}
