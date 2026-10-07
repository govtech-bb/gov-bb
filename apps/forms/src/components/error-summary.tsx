import type { FieldValidationErrors } from "@forms/types";
import {
  ErrorSummary as GovErrorSummary,
  type ErrorSummaryItem,
} from "@govtech-bb/react";

export default function ErrorSummary({
  errors,
}: {
  errors: FieldValidationErrors;
}) {
  if (!errors) {
    return null;
  }

  const formatter = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  });

  const fieldErrorItems: ErrorSummaryItem[] = [];

  for (const [fieldId, errorMessages] of Object.entries(errors)) {
    if (!errorMessages || errorMessages.length === 0) continue;
    fieldErrorItems.push({
      href: `#${fieldId}`,
      label: formatter.format(errorMessages),
    });
  }

  if (fieldErrorItems.length === 0) return null;

  return <GovErrorSummary errors={fieldErrorItems} />;
}
