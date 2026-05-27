import { FieldValidationErrors } from "@forms/types";
import React, { JSX } from "react";

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

  const fieldErrorItems: JSX.Element[] = [];

  for (const [fieldId, errorMessages] of Object.entries(errors)) {
    if (!errorMessages || errorMessages.length === 0) continue;
    fieldErrorItems.push(
      <li key={fieldId}>
        <a className="govbb-error-summary__link" href={`#${fieldId}`}>
          {formatter.format(errorMessages)}
        </a>
      </li>,
    );
  }

  if (fieldErrorItems.length === 0) return null;

  return (
    <div className="govbb-error-summary" role="alert">
      <h2 className="govbb-error-summary__title">There is a problem</h2>
      <ul className="govbb-error-summary__list">{fieldErrorItems}</ul>
    </div>
  );
}
