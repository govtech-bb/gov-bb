import { FormFetchError } from "@forms/form-api";
import { LANDING_URL } from "../config/landing";

interface FormErrorProps {
  error: Error;
  reset: () => void;
}

export default function FormError({ error, reset }: FormErrorProps) {
  const isNotFound = error instanceof FormFetchError && error.status === 404;

  const isNetworkError = error instanceof FormFetchError && error.status === 0;

  const heading = isNotFound
    ? "Form not found"
    : isNetworkError
      ? "Connection error"
      : "Something went wrong";

  const suggestion = isNotFound
    ? "Check the URL and try again, or return to the homepage."
    : isNetworkError
      ? "Unable to reach the server. Check your connection and try again."
      : "An unexpected error occurred while loading the form.";

  return (
    <div className="form-page form-page__message">
      <div>
        <h1 className="govbb-text-h1">{heading}</h1>
        <p>{error.message}</p>
        <p>{suggestion}</p>
      </div>

      <div className="govbb-btn-group">
        <button type="button" className="govbb-btn" onClick={reset}>
          Try again
        </button>
        <a className="govbb-link" href={LANDING_URL}>
          Go to Homepage
        </a>
      </div>
    </div>
  );
}
