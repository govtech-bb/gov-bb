import { ErrorMessage as GovErrorMessage } from "@govtech-bb/react";

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
    <GovErrorMessage id={id} role="status">
      {message}
    </GovErrorMessage>
  );
}
