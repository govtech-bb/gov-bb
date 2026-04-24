import designSystem from "../lib/design-system";
import React from "react";
import { ReviewProps } from "../types/props.type";

export default function Review({ formMeta, form }: ReviewProps) {
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
              <a href={`/forms/${formMeta.formId}?step=${step.stepId}`}>
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
