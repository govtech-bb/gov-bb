import { FieldValidationErrors } from "@web/types";
import React, { JSX } from "react";

export default function ErrorSummary({
  errors,
}: {
  errors: FieldValidationErrors;
}) {
  if (!errors) {
    return null;
  }

  const fieldErrorItems: JSX.Element[] = [];

  for (const [fieldId, errorMessages] of Object.entries(errors)) {
    if (!errorMessages || errorMessages.length === 0) continue;
    fieldErrorItems.push(
      <li key={fieldId}>
        <a href={`#${fieldId}`}>{errorMessages.join(", ")}</a>
      </li>,
    );
  }

  if (fieldErrorItems.length === 0) return null;

  return (
    <div data-error-summary role="alert">
      <h2>There is a problem</h2>
      <ul>{fieldErrorItems}</ul>
    </div>
  );
}
