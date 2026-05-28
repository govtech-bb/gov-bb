import React from "react";

// Standard visually-hidden styling so screen readers announce the "Error:"
// prefix while it stays invisible on screen. Inline-styled to avoid depending
// on a utility class that doesn't exist in the forms stylesheet.
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

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
  return (
    <p data-error id={id}>
      <span style={visuallyHidden}>Error:</span> {message}
    </p>
  );
}
