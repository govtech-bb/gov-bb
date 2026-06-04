import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnyFormApi } from "@tanstack/react-form";
import { ClientFormStep, ClientPrimitive, FormMeta } from "@forms/types";

export default function Review({
  formMeta,
  form,
  visibleSteps,
}: {
  formMeta: FormMeta;
  form: AnyFormApi;
  visibleSteps: ClientFormStep[];
}) {
  const navigate = useNavigate({ from: "/forms/$formId/" });

  const excludeStepIds = [
    "check-your-answers",
    "declaration",
    "submission-confirmation",
  ];

  const formatDate = (dateValue: {
    day: number;
    month: number;
    year: number;
  }) => {
    const { day, month, year } = dateValue;
    const formattedDate = new Date(year, month - 1, day)
      .toDateString()
      .trim()
      .replace(/^\w+\s/, ""); // Remove the day of the week from the date string
    return formattedDate;
  };

  const handleChangeClick =
    (stepId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      void navigate({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          step: stepId,
        }),
      });
    };

  const getUploadedFileName = (fileValue: unknown): string | null => {
    if (!fileValue || typeof fileValue !== "object") return null;

    if (fileValue instanceof File) {
      return fileValue.name;
    }

    const fileName = (fileValue as { name?: unknown }).name;

    return typeof fileName === "string" && fileName.trim().length > 0
      ? fileName
      : null;
  };

  // Normalise a raw scalar to a display string, or null when it is empty.
  const emptyToNull = (value: unknown): string | null =>
    value === undefined || value === null || value === ""
      ? null
      : String(value);

  // Returns the formatted display value for a field, or null when the field
  // has no answer. File fields are the deliberate exception — they always
  // return a string (filenames or "No file selected") so their row always
  // renders. Callers filter out null/"" rows so blank fields are omitted.
  const getFieldDisplayValue = (field: ClientPrimitive): string | null => {
    const value = form.getFieldValue(field.id);

    switch (field.htmlType) {
      case "select": {
        if (!field.options) return emptyToNull(value);
        return (
          field.options
            .find((option) => option.value === value)
            ?.label.replace("Saint ", "St ") ?? null
        );
      }
      case "date": {
        if (!value) return null;
        return formatDate(
          value as {
            day: number;
            month: number;
            year: number;
          },
        );
      }
      case "checkbox": {
        if (!field.options) return emptyToNull(value);
        const selectedOptions = field.options.filter(
          (option) =>
            option.value === value ||
            (Array.isArray(value) && value.includes(option.value)),
        );
        return selectedOptions.length > 0
          ? selectedOptions.map((option) => option.label).join(", ")
          : null;
      }
      case "radio": {
        if (!field.options) return emptyToNull(value);
        return (
          field.options.find((option) => option.value === value)?.label ?? null
        );
      }
      case "file": {
        const fileNames = Array.isArray(value)
          ? value
              .map((file) => getUploadedFileName(file))
              .filter((name): name is string => name !== null) // remove nulls
          : [];

        if (fileNames.length === 0) {
          return "No file selected";
        }

        return fileNames.join(", ");
      }
      default:
        return emptyToNull(value);
    }
  };

  return (
    <div className="form-page__review">
      {visibleSteps
        .filter((step) => !excludeStepIds.includes(step.stepId))
        .map((step) => {
          // Compute each visible field's display value once, then drop the
          // rows that have no answer so blank fields are omitted entirely.
          // Show-hide toggles are UI controls, not answers — never a row,
          // regardless of toggle state.
          const rows = step.fields
            .filter(
              (field) =>
                !field.hidden &&
                !field.conditionallyHidden &&
                field.htmlType !== "show-hide",
            )
            .map((field: ClientPrimitive) => ({
              field,
              value: getFieldDisplayValue(field),
            }))
            .filter(({ value }) => value !== null && value !== "");

          return (
            <section key={step.stepId} className="govbb-summary-section">
              <h2 className="govbb-summary-section__title">{step.title}</h2>
              <div className="govbb-summary-section__action">
                <a
                  className="govbb-link"
                  href={`/forms/${formMeta.formId}?step=${step.stepId}`}
                  onClick={handleChangeClick(step.stepId)}
                >
                  Change{" "}
                  <span className="govbb-visually-hidden">{step.title}</span>
                </a>
              </div>
              {rows.length === 0 ? (
                <p className="govbb-summary-section__empty">
                  No values provided
                </p>
              ) : (
                <dl className="govbb-summary-list">
                  {rows.map(({ field, value }) => (
                    <div key={field.id} className="govbb-summary-list__row">
                      <dt className="govbb-summary-list__key">{field.label}</dt>
                      <dd className="govbb-summary-list__value">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          );
        })}
    </div>
  );
}
