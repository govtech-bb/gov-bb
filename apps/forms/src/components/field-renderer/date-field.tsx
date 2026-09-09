import { JSX } from "react";
import { Fieldset, Hint, Input, Label } from "@govtech-bb/react";
import ErrorMessage from "../error-message";
import { parseDatePart } from "@forms/lib";
import { DateValue } from "@govtech-bb/form-types";
import { FieldRenderContext } from "./render-context";

export function renderDateField(ctx: FieldRenderContext): JSX.Element {
  const {
    field,
    f,
    sharedProps,
    requiredProps,
    hintId,
    errorId,
    errorMessage,
    describedBy,
    labelClass,
    labelSuffix,
    partInvalid,
    commitChange,
  } = ctx;

  const value = f.state.value as DateValue | undefined;
  // The fieldset id is the ErrorSummary anchor target; the error is
  // described at the group level per the GOV.UK date input markup.
  return (
    <Fieldset id={field.id} role="group" aria-describedby={describedBy}>
      <legend className={labelClass("govbb-fieldset__legend")}>
        {field.label}
        {labelSuffix}
      </legend>
      {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
      <ErrorMessage id={errorId} message={errorMessage} />
      <div className="govbb-date-input">
        {(
          [
            ["day", "Day"],
            ["month", "Month"],
            ["year", "Year"],
          ] as const
        ).map(([part, label]) => (
          <div className="govbb-date-input__part" key={part}>
            <Label htmlFor={`${field.id}-${part}`}>{label}</Label>
            <Input
              {...sharedProps}
              {...requiredProps}
              id={`${field.id}-${part}`}
              name={`${field.name}-${part}`}
              className={
                part === "year"
                  ? "govbb-date-input__field govbb-date-input__field--year"
                  : "govbb-date-input__field"
              }
              value={value?.[part] ?? ""}
              type="text"
              inputMode="numeric"
              aria-describedby={undefined}
              aria-invalid={partInvalid(part)}
              onChange={(e) =>
                commitChange({
                  ...value,
                  [part]: parseDatePart(e.target.value),
                })
              }
            />
          </div>
        ))}
      </div>
    </Fieldset>
  );
}
