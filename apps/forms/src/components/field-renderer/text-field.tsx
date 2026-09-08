import { JSX } from "react";
import { FormGroup, Hint, Label } from "@govtech-bb/react";
import ErrorMessage from "../error-message";
import { MaskedInput } from "../masked-input";
import { NumberInput } from "./number-input";
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

  // Number fields render the design-system number input (custom
  // steppers, native spinners hidden); the other text-like types keep
  // the masked `.govbb-input`. `withRequired` mirrors the original
  // behaviour where the repeating array path omits requiredProps.
  const renderControl = (
    value: string,
    onChange: (next: string) => void,
    withRequired: boolean,
    index?: number,
  ): JSX.Element => {
    const props = rowInputProps(sharedProps, field, index);
    return isNumber ? (
      <NumberInput
        value={value}
        onChange={onChange}
        invalid={invalid}
        inputProps={withRequired ? { ...props, ...requiredProps } : props}
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
    <FormGroup
      className={isNumber ? undefined : "form-page__text-field"}
      data-field-width={field.ui?.width}
    >
      <Label
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
