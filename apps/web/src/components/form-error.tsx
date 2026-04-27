import { FormFetchError } from "@web/lib";

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
    <div>
      <div>
        <h1>{heading}</h1>
        <p>{error.message}</p>
        <p>{suggestion}</p>
      </div>

      <div>
        <button type="button" onClick={reset}>
          Try again
        </button>
        <a href="/">Go to Homepage</a>
      </div>
    </div>
  );
}
