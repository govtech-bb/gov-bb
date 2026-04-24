import designSystem from "../lib/design-system";
import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ReviewProps } from "@web/types";

export default function Review({ formMeta, form }: ReviewProps) {
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
                      {field.htmlType === "select" && field.options
                        ? field.options
                            .find(
                              (option) =>
                                option.value === form.state.values[field.id],
                            )
                            ?.label.replace("Saint ", "St ")
                        : field.htmlType === "date" &&
                            form.state.values[field.id]
                          ? formatDate(
                              form.state.values[field.id] as {
                                day: number;
                                month: number;
                                year: number;
                              },
                            )
                          : (form.state.values[field.id] as string | null)}
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
