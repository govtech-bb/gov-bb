import React from "react";

export default function ErrorMessage({ message }: { message: string }) {
  if (!message || message.length === 0) {
    return null;
  }
  return (
    // role="status" (polite) not "alert" (assertive): a step with several
    // fields would otherwise fire one interruption per field on validation.
    // The page-level ErrorSummary keeps its assertive role for one announcement.
    <p className="govbb-error-message" role="status">
      {message}
    </p>
  );
}
