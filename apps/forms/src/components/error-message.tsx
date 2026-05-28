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
  // Not a live region (GOV.UK pattern): the error is associated to its input
  // via aria-describedby and announced by the focus-managed ErrorSummary, so
  // an inline live role would only cause duplicate/interrupting announcements.
  // The "Error:" prefix is read by screen readers but hidden visually.
  return (
    <p data-error id={id}>
      <span className="govbb-visually-hidden">Error:</span> {message}
    </p>
  );
}
