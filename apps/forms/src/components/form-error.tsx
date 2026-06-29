import { FormFetchError } from "@forms/form-api";
import { LANDING_URL } from "../config/landing";
import { ErrorPage } from "./error-page";

interface FormErrorProps {
  error: Error;
  reset: () => void;
}

const HOMEPAGE = { label: "Return to homepage", href: LANDING_URL };
const SERVICE_DIRECTORY = {
  label: "Browse our service directory",
  href: `${LANDING_URL}/services`,
};

export default function FormError({ error, reset }: FormErrorProps) {
  const isNotFound = error instanceof FormFetchError && error.status === 404;
  const isNetworkError = error instanceof FormFetchError && error.status === 0;

  if (isNotFound) {
    return (
      <ErrorPage
        title="Form not found"
        intro="We couldn't find the form you're looking for. It may have been moved, removed, or the web address may have been typed incorrectly."
        suggestions={[
          "Check the web address for typos",
          "Return to the homepage",
          "Browse our service directory",
        ]}
        secondary={SERVICE_DIRECTORY}
        primary={HOMEPAGE}
      />
    );
  }

  if (isNetworkError) {
    return (
      <ErrorPage
        title="Connection error"
        intro="We couldn't reach the server to load this form. Check your internet connection and try again."
        suggestions={[
          "Check your internet connection",
          "Wait a moment and try again",
          "Return to the homepage",
        ]}
        secondary={HOMEPAGE}
        primary={{ label: "Try again", onClick: reset }}
      />
    );
  }

  return (
    <ErrorPage
      title="Something went wrong"
      intro="An unexpected error occurred while loading the form. Please try again."
      suggestions={["Wait a moment and try again", "Return to the homepage"]}
      secondary={HOMEPAGE}
      primary={{ label: "Try again", onClick: reset }}
    />
  );
}
