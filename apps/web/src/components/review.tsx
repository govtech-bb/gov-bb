import designSystem from "../lib/design-system";
import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ClientPrimitive, FormMeta } from "@web/types";
import { getFormData } from "../lib/session-storage";

export default function Review(formMeta: FormMeta) {
  const navigate = useNavigate({ from: "/forms/$formId/" });

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
        search: (prev) => ({
          ...prev,
          step: stepId,
        }),
      });
    };

  const formValues = getFormData(formMeta.formId) || {};

  const getFieldDisplayValue = (stepId: string, field: ClientPrimitive) => {
    const value = formValues[stepId]?.[field.name];

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
      default:
        return value as string | null;
    }
  };

  return (
    <div className={designSystem.review}>
      {formMeta.steps
        .filter(
          (step) =>
            step.stepId !== "check-your-answers" &&
            step.stepId !== "declaration",
        )
        .map((step) => (
          <div key={step.stepId} className={designSystem.reviewStep}>
            <div className={designSystem.reviewStepTitle}>
              <h2>{step.title}</h2>
              <a
                href={`/forms/${formMeta.formId}?step=${step.stepId}`}
                onClick={handleChangeClick(step.stepId)}
              >
                Change
              </a>
            </div>

            <table className={designSystem.reviewFieldTable}>
              <tbody>
                {step.fields.map((field) => (
                  <tr key={field.id} className={designSystem.reviewFieldRow}>
                    <td className={designSystem.reviewFieldLabel}>
                      {field.label}
                    </td>
                    <td className={designSystem.reviewFieldValue}>
                      {getFieldDisplayValue(step.stepId, field)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
