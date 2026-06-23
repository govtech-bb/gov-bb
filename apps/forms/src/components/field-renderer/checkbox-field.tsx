import { JSX } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ErrorMessage from "../error-message";
import { markdownComponents } from "../markdown-components";
import { FieldRenderContext } from "./render-context";

export function renderCheckboxField(ctx: FieldRenderContext): JSX.Element {
  const {
    field,
    f,
    sharedProps,
    requiredProps,
    invalid,
    hintId,
    errorId,
    errorMessage,
    labelClass,
    commitChange,
  } = ctx;

  if (field.options && field.options.length === 1) {
    const option = field.options[0];
    const value = (f.state.value as string | undefined) ?? "";
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
          <div
            className="govbb-checkbox-item form-page__single-checkbox"
            key={option.value}
          >
            <input
              {...sharedProps}
              {...requiredProps}
              id={`${field.id}-${option.value}`}
              className="govbb-checkbox"
              checked={option.value === value}
              aria-invalid={invalid}
              onChange={() =>
                commitChange(option.value === value ? "" : option.value)
              }
            />
            <label
              className="govbb-checkbox-item__label"
              htmlFor={`${field.id}-${option.value}`}
            >
              {/* Declaration/consent copy is authored in markdown
                  (bullets, bold) — render it so the statement reads
                  as intended rather than as a run-on line. */}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {option.label}
              </ReactMarkdown>
            </label>
          </div>
        </div>
      </fieldset>
    );
  }

  const checkboxValues: string[] =
    (f.state.value as string[] | undefined) ?? [];

  const toggle = (item: string) => {
    const next = checkboxValues.includes(item)
      ? checkboxValues.filter((cv) => cv !== item)
      : [...checkboxValues, item];
    commitChange(next);
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
      <div className="form-page__options">
        {field.options?.map((option) => {
          return (
            <div className="govbb-checkbox-item" key={option.value}>
              <input
                {...sharedProps}
                id={`${field.id}-${option.value}`}
                className="govbb-checkbox"
                checked={checkboxValues.includes(option.value)}
                aria-invalid={invalid}
                onChange={() => toggle(option.value)}
              />
              <label
                className="govbb-checkbox-item__label"
                htmlFor={`${field.id}-${option.value}`}
              >
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
