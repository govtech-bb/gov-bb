import React from "react";

export default function ErrorMessage({
  id,
  message,
}: {
  id?: string;
  message: string;
}) {
  if (!message || message.length === 0) {
    return null;
  }
  // id lets the input reference this via aria-describedby (GOV.UK association).
  // role="status" (polite) not "alert" (assertive): a step with several fields
  // would otherwise fire one interruption per field on validation. The
  // page-level ErrorSummary keeps its assertive role for one announcement.
  // The "Error:" prefix is read by screen readers but hidden visually.
  return (
    <p className="govbb-error-message" id={id} role="status">
      <span className="govbb-visually-hidden">Error:</span> {message}
    </p>
  );
}
