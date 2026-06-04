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
  // Polite, not assertive: one step can render many of these at once, and the
  // ErrorSummary already makes the single assertive announcement.
  return (
    <p className="govbb-error-message" id={id} role="status">
      <span className="govbb-visually-hidden">Error:</span> {message}
    </p>
  );
}
