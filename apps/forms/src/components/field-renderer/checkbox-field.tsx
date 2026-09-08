import { JSX } from "react";
import { Checkbox, Fieldset, Hint } from "@govtech-bb/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ErrorMessage from "../error-message";
import { FieldRenderContext } from "./render-context";
import FieldRenderer from "./index";

export function renderCheckboxField(ctx: FieldRenderContext): JSX.Element {
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
    labelSuffix,
    commitChange,
    insetFieldsByOption,
    formId,
    previewToken,
    draftToken,
  } = ctx;

  // Keep the field ID on the fieldset; let the package generate option IDs.
  const { id: _fieldId, ...inputProps } = sharedProps;

  if (field.options && field.options.length === 1) {
    const option = field.options[0];
    const value = (f.state.value as string | undefined) ?? "";
    return (
      <Fieldset className="form-page__choice-field" id={field.id}>
        <legend className={labelClass("govbb-fieldset__legend")}>
          {field.label}
          {labelSuffix}
        </legend>
        {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
        <ErrorMessage id={errorId} message={errorMessage} />
        <Checkbox
          {...inputProps}
          {...requiredProps}
          checked={option.value === value}
          aria-invalid={invalid}
          onChange={() =>
            commitChange(option.value === value ? "" : option.value)
          }
          label={
            <div className="govbb-prose wrap-anywhere">
              {/* Declaration/consent copy is authored in markdown
                  (bullets, bold) — render it so the statement reads
                  as intended rather than as a run-on line. */}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {option.label}
              </ReactMarkdown>
            </div>
          }
        />
      </Fieldset>
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
    <Fieldset className="form-page__choice-field" id={field.id}>
      <legend className={labelClass("govbb-fieldset__legend")}>
        {field.label}
        {labelSuffix}
      </legend>
      {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
      <ErrorMessage id={errorId} message={errorMessage} />
      {field.options?.map((option) => {
        const insetEntries = insetFieldsByOption?.get(option.value);
        const isChecked = checkboxValues.includes(option.value);
        return (
          <Checkbox
            key={option.value}
            {...inputProps}
            label={option.label}
            checked={isChecked}
            aria-invalid={invalid}
            onChange={() => toggle(option.value)}
            conditional={
              insetEntries && isChecked
                ? insetEntries.map(
                    ({
                      field: insetField,
                      validationProperties: insetValidation,
                      insetFieldsByOption: nestedInsets,
                    }) => (
                      <FieldRenderer
                        key={insetField.id}
                        form={form}
                        field={insetField}
                        validationProperties={insetValidation}
                        insetFieldsByOption={nestedInsets}
                        formId={formId}
                        previewToken={previewToken}
                        draftToken={draftToken}
                      />
                    ),
                  )
                : undefined
            }
          />
        );
      })}
    </Fieldset>
  );
}
