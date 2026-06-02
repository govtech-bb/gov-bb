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

  const getFieldDisplayValue = (field: ClientPrimitive) => {
    const value = form.getFieldValue(field.id);

    switch (field.htmlType) {
      case "select": {
        if (!field.options) return value as string | null;
        return field.options
          .find((option) => option.value === value)
          ?.label.replace("Saint ", "St ");
      }
      case "date": {
        if (!value) return value as string | null;
        return formatDate(
          value as {
            day: number;
            month: number;
            year: number;
          },
        );
      }
      case "checkbox": {
        if (!field.options) return value as string | null;
        const selectedOptions = field.options.filter(
          (option) =>
            option.value === value ||
            (Array.isArray(value) && value.includes(option.value)),
        );
        return selectedOptions.map((option) => option.label).join(", ");
      }
      case "radio": {
        if (!field.options) return value as string | null;
        return field.options.find((option) => option.value === value)?.label;
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
        return value === undefined || value === null ? "" : String(value);
    }
  };

  return (
    <div className="form-page__review">
      {visibleSteps
        .filter((step) => !excludeStepIds.includes(step.stepId))
        .map((step) => (
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
            <dl className="govbb-summary-list">
              {step.fields
                .filter((field) => !field.hidden && !field.conditionallyHidden)
                .map((field: ClientPrimitive) => (
                  <div key={field.id} className="govbb-summary-list__row">
                    <dt className="govbb-summary-list__key">{field.label}</dt>
                    <dd className="govbb-summary-list__value">
                      {getFieldDisplayValue(field)}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
    </div>
  );
}
