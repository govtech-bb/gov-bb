import { JSX } from "react";
import { FormGroup, Hint, Label, NumberInput } from "@govtech-bb/react";
import ErrorMessage from "../error-message";
import { MaskedInput } from "../masked-input";
import { renderRepeatableOrSingle, rowInputProps } from "./repeatable-field";
import { FieldRenderContext } from "./render-context";

/** Renders the `text` / `number` / `tel` / `email` field types. */
export function renderTextField(ctx: FieldRenderContext): JSX.Element {
  const {
    field,
    sharedProps,
    requiredProps,
    autoComplete,
    invalid,
    hintId,
    errorId,
    errorMessage,
    labelSuffix,
  } = ctx;

  const isNumber = field.htmlType === "number";

  // Repeated rows omit requiredProps; the array validator checks the group.
  const renderControl = (
    value: string,
    onChange: (next: string) => void,
    withRequired: boolean,
    index?: number,
  ): JSX.Element => {
    const props = rowInputProps(sharedProps, field, index);
    return isNumber ? (
      <NumberInput
        {...props}
        {...(withRequired ? requiredProps : {})}
        labelId={`${field.id}-label`}
        min={0}
        inputMode="numeric"
        value={value}
        aria-invalid={invalid}
        onInput={(event) => onChange(event.currentTarget.value)}
      />
    ) : (
      <MaskedInput
        key={props.id}
        mask={field.mask}
        {...props}
        {...(withRequired ? requiredProps : {})}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  const inputElement = renderRepeatableOrSingle(ctx, renderControl);

  return (
    <FormGroup data-field-width={field.ui?.width}>
      <Label
        id={`${field.id}-label`}
        className={field.ui?.hideLabel ? "govbb-visually-hidden" : undefined}
        htmlFor={field.id}
        optional={labelSuffix !== null}
      >
        {field.label}
      </Label>
      {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
      <ErrorMessage id={errorId} message={errorMessage} />
      {inputElement}
    </FormGroup>
  );
}
