import React from "react";

export default function ErrorMessage({ message }: { message: string }) {
  if (!message || message.length === 0) {
    return null;
  }
  return (
    <p data-error role="alert">
      {message}
    </p>
  );
}
