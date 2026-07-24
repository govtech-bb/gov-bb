import { JSX } from "react";
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
    labelClass,
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
      <div className="govbb-input-wrapper">
        <MaskedInput
          key={props.id}
          mask={field.mask}
          {...props}
          {...(withRequired ? requiredProps : {})}
          autoComplete={autoComplete}
          className="govbb-input"
          value={value}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  };

  const inputElement = renderRepeatableOrSingle(ctx, renderControl);

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
      {inputElement}
    </div>
  );
}
