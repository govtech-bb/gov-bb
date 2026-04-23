import { FieldValidationErrors } from "@web/types";
import React, { JSX } from "react";

export default function ErrorSummary({
  errors,
}: {
  errors?: FieldValidationErrors;
}) {
  if (!errors) {
    return null;
  }

  const fieldErrorItems: JSX.Element[] = [];
  const entries = errors as Record<string, string[]>;

  for (const [fieldId, errors] of Object.entries(entries)) {
    if (!errors || errors.length === 0) continue;
    fieldErrorItems.push(
      <li key={fieldId}>
        <a href={`#${fieldId}`}>{errors.join(", ")}</a>
      </li>,
    );
  }

  return (
    <div data-error-summary role="alert">
      <h2>There is a problem</h2>
      <ul>{fieldErrorItems}</ul>
    </div>
  );
}
