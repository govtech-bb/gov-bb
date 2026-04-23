import React from "react";

export default function ErrorMessage({ message }: { message: string }) {
  return (
    <p data-error role="alert">
      {message}
    </p>
  );
}
