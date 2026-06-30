import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnyFormApi } from "@tanstack/react-form";
import { ClientFormStep, ClientPrimitive, FormMeta } from "@forms/types";
import { getInstanceMarker, getVisibleFields } from "@forms/lib";
import { DateValue } from "@govtech-bb/form-types";
import { resolveStepTitle } from "@govtech-bb/form-conditions";
import { buildStepScopedValues } from "../lib/form-builder/helpers/value-tree";
import { trackEvent } from "../lib/analytics";
import { formCategory } from "../lib/form-category";

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
    "intro",
    "check-your-answers",
    "declaration",
    "submission-confirmation",
  ];

  // Date parts are stored as digit-strings (#815); coerce to numbers for the
  // Date constructor so leading zeros ("09") format correctly.
  const formatDate = (dateValue: DateValue) => {
    const { day, month, year } = dateValue;
    const formattedDate = new Date(Number(year), Number(month) - 1, Number(day))
      .toDateString()
      .trim()
      .replace(/^\w+\s/, ""); // Remove the day of the week from the date string
    return formattedDate;
  };

  const handleChangeClick =
    (stepId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      trackEvent("form-step-edit", {
        form: formMeta.formId,
        category: formCategory(formMeta.formId),
        step: stepId,
      });
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
        return formatDate(value as DateValue);
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

  // Step titles may carry per-answer overrides (#871); resolve each against the
  // current values so the review heading matches what the applicant saw.
  const stepScopedValues = buildStepScopedValues(
    form.state.values as Record<string, unknown>,
  );

  return (
    <div className="form-page__review">
      {visibleSteps
        .filter((step) => !excludeStepIds.includes(step.stepId))
        .map((step) => {
          const stepTitle = resolveStepTitle(step, stepScopedValues);
          // Compute each visible field's display value once, then drop the
          // rows that have no answer so blank fields are omitted entirely.
          // Visibility is evaluated from current form values (#737) — the
          // render-mutated conditionallyHidden flag goes stale for fields
          // that never re-mounted after their controlling answer flipped.
          // Show-hide toggles are UI controls, not answers — never a row,
          // regardless of toggle state.
          const rows = getVisibleFields(step, form)
            .filter((field) => field.htmlType !== "show-hide")
            .map((field: ClientPrimitive) => ({
              field,
              value: getFieldDisplayValue(field),
            }))
            .filter(({ value }) => value !== null && value !== "");

          // #801: repeat instances beyond the first carry a marker so the
          // heading distinguishes e.g. "… — Dependent 2" from the first
          // instance. Base steps / first instances return undefined.
          const marker = getInstanceMarker(step);

          return (
            <section key={step.stepId} className="govbb-summary-section">
              <h2 className="govbb-summary-section__title">
                {marker ? `${stepTitle} — ${marker.text}` : stepTitle}
              </h2>
              <div className="govbb-summary-section__action">
                <a
                  className="govbb-link"
                  href={`/forms/${formMeta.formId}?step=${step.stepId}`}
                  onClick={handleChangeClick(step.stepId)}
                >
                  Change{" "}
                  <span className="govbb-visually-hidden">{stepTitle}</span>
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
