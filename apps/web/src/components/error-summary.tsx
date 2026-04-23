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

  for (const [fieldId, errorMessage] of Object.entries(errors)) {
    if (!errorMessage || errorMessage.length === 0) continue;
    fieldErrorItems.push(
      <li key={fieldId}>
        <a href={`#${fieldId}`}>{errorMessage.join(", ")}</a>
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
