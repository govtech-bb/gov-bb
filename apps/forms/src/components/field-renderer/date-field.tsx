import { JSX } from "react";
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
    partInvalid,
    commitChange,
  } = ctx;

  const value = f.state.value as DateValue | undefined;
  // The fieldset id is the ErrorSummary anchor target; the error is
  // described at the group level per the GOV.UK date input markup.
  return (
    <fieldset
      className="govbb-fieldset"
      id={field.id}
      role="group"
      aria-describedby={describedBy}
    >
      <legend className={labelClass("govbb-fieldset__legend")}>
        {field.label}
      </legend>
      {field.hint && (
        <p className="govbb-hint" id={hintId}>
          {field.hint}
        </p>
      )}
      <ErrorMessage id={errorId} message={errorMessage} />
      <div className="govbb-date-input">
        <div className="govbb-date-input__part">
          <label
            className="govbb-date-input__label"
            htmlFor={`${field.id}-day`}
          >
            Day
          </label>
          <div className="govbb-date-input-wrapper">
            <input
              {...sharedProps}
              {...requiredProps}
              id={`${field.id}-day`}
              name={`${field.name}-day`}
              className="govbb-date-input__field"
              value={value?.day ?? ""}
              type="text"
              inputMode="numeric"
              // undefined overrides sharedProps — the group carries
              // the description, double announcements are noise
              aria-describedby={undefined}
              aria-invalid={partInvalid("day")}
              onChange={(e) => {
                commitChange({
                  ...value,
                  day: parseDatePart(e.target.value),
                });
              }}
            />
          </div>
        </div>

        <div className="govbb-date-input__part">
          <label
            className="govbb-date-input__label"
            htmlFor={`${field.id}-month`}
          >
            Month
          </label>
          <div className="govbb-date-input-wrapper">
            <input
              {...sharedProps}
              {...requiredProps}
              id={`${field.id}-month`}
              name={`${field.name}-month`}
              className="govbb-date-input__field"
              type="text"
              inputMode="numeric"
              value={value?.month ?? ""}
              aria-describedby={undefined}
              aria-invalid={partInvalid("month")}
              onChange={(e) => {
                commitChange({
                  ...value,
                  month: parseDatePart(e.target.value),
                });
              }}
            />
          </div>
        </div>

        <div className="govbb-date-input__part">
          <label
            className="govbb-date-input__label"
            htmlFor={`${field.id}-year`}
          >
            Year
          </label>
          <div className="govbb-date-input-wrapper govbb-date-input-wrapper--year">
            <input
              {...sharedProps}
              {...requiredProps}
              id={`${field.id}-year`}
              name={`${field.name}-year`}
              className="govbb-date-input__field"
              type="text"
              inputMode="numeric"
              value={value?.year ?? ""}
              aria-describedby={undefined}
              aria-invalid={partInvalid("year")}
              onChange={(e) => {
                commitChange({
                  ...value,
                  year: parseDatePart(e.target.value),
                });
              }}
            />
          </div>
        </div>
      </div>
    </fieldset>
  );
}
