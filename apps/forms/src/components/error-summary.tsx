import { FieldValidationErrors } from "@forms/types";
import React, { JSX, useEffect, useRef } from "react";

export default function ErrorSummary({
  errors,
}: {
  errors: FieldValidationErrors;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const formatter = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  });

  const fieldErrorItems: JSX.Element[] = [];
  if (errors) {
    for (const [fieldId, errorMessages] of Object.entries(errors)) {
      if (!errorMessages || errorMessages.length === 0) continue;
      fieldErrorItems.push(
        <li key={fieldId}>
          <a href={`#${fieldId}`}>{formatter.format(errorMessages)}</a>
        </li>,
      );
    }
  }

  const hasErrors = fieldErrorItems.length > 0;
  // Signature of the current error set, so focus moves to the summary only when
  // the errors change (e.g. on submit / re-validate) rather than on every
  // render.
  const errorKey = errors
    ? Object.keys(errors)
        .filter((k) => errors[k] && errors[k].length > 0)
        .sort()
        .join(",")
    : "";

  useEffect(() => {
    if (hasErrors && ref.current) ref.current.focus();
  }, [errorKey, hasErrors]);

  if (!hasErrors) return null;

  // role="alert" + focus management (GOV.UK pattern): moving focus here makes
  // the summary the single announcement point for the step's errors. Inline
  // field errors are not live regions — they're linked via aria-describedby.
  return (
    <div data-error-summary role="alert" ref={ref} tabIndex={-1}>
      <h2>There is a problem</h2>
      <ul>{fieldErrorItems}</ul>
    </div>
  );
}
