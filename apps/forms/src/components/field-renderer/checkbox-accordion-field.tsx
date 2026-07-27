import { JSX } from "react";
import ErrorMessage from "../error-message";
import { FieldRenderContext } from "./render-context";

/**
 * A collapsible multi-select. Each `group` is a native <details>/<summary>
 * category (reusing the govbb-show-hide disclosure look) that expands to reveal
 * its item checkboxes; categories start collapsed. Selections accumulate into a
 * single flat string[] across all groups — identical to a plain checkbox field
 * — so collapsing a category never clears what was ticked inside it. A
 * `higherRisk` group carries a visible "Higher-risk" badge on its summary.
 */
export function renderCheckboxAccordionField(
  ctx: FieldRenderContext,
): JSX.Element {
  const {
    field,
    f,
    sharedProps,
    invalid,
    hintId,
    errorId,
    errorMessage,
    labelClass,
  } = ctx;

  const selected: string[] = (f.state.value as string[] | undefined) ?? [];

  const toggle = (item: string) => {
    const next = selected.includes(item)
      ? selected.filter((v) => v !== item)
      : [...selected, item];
    ctx.commitChange(next);
  };

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
      <div className="form-page__accordion">
        {field.groups?.map((group) => (
          <details
            className="govbb-show-hide govbb-accordion-group"
            key={group.label}
          >
            <summary className="govbb-show-hide__summary">
              {group.label}
              {group.higherRisk && (
                <span className="govbb-tag govbb-tag--higher-risk">
                  Higher-risk
                </span>
              )}
            </summary>
            <div className="form-page__options govbb-accordion-group__content">
              {group.options.map((option) => (
                <div className="govbb-checkbox-item" key={option.value}>
                  <input
                    type="checkbox"
                    name={sharedProps.name}
                    id={`${field.id}-${option.value}`}
                    className="govbb-checkbox"
                    checked={selected.includes(option.value)}
                    aria-invalid={invalid}
                    onBlur={sharedProps.onBlur}
                    onChange={() => toggle(option.value)}
                  />
                  <label
                    className="govbb-checkbox-item__label"
                    htmlFor={`${field.id}-${option.value}`}
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </fieldset>
  );
}
