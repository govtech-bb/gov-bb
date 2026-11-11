import {
  useParams,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import React from "react";
import { FormFetchError } from "@forms/form-api";
import { LANDING_URL } from "../config/landing";
import { trackEvent, type TrackingData } from "../lib/analytics";
import { ErrorPage } from "./error-page";

const HOMEPAGE = { label: "Return to homepage", href: LANDING_URL };
const SERVICE_DIRECTORY = {
  label: "Browse our service directory",
  href: `${LANDING_URL}/services`,
};

type LoadErrorReason = TrackingData["form-load-error"]["reason"];

/**
 * A fixed code for why the page failed to load; never the error's text.
 * `server` is everything else: other HTTP statuses, and any error thrown while
 * the form builds or renders.
 */
function loadErrorReason(error: unknown): LoadErrorReason {
  if (error instanceof FormFetchError && error.status === 404) {
    return "not-found";
  }
  if (error instanceof FormFetchError && error.status === 0) return "network";
  return "server";
}

export default function FormError({ error }: ErrorComponentProps<unknown>) {
  const router = useRouter();
  const retry = () => {
    void router.invalidate();
  };
  const reason = loadErrorReason(error);
  // This is also the router's default error page, so a route may have no form.
  const formId = useParams({ strict: false, shouldThrow: false })?.formId;

  // Once per error: the ref survives StrictMode's second effect run (#3513).
  // A not-found id is whatever was typed in the address, not a form, so it is
  // left out of the event data.
  const tracked = React.useRef<unknown>(undefined);
  React.useEffect(() => {
    if (tracked.current === error) return;
    tracked.current = error;
    trackEvent(
      "form-load-error",
      formId && reason !== "not-found" ? { form: formId, reason } : { reason },
    );
  }, [error, formId, reason]);

  if (reason === "not-found") {
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

  if (reason === "network") {
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
        primary={{ label: "Try again", onClick: retry }}
      />
    );
  }

  return (
    <ErrorPage
      title="Something went wrong"
      intro="An unexpected error occurred while loading the form. Please try again."
      suggestions={["Wait a moment and try again", "Return to the homepage"]}
      secondary={HOMEPAGE}
      primary={{ label: "Try again", onClick: retry }}
    />
  );
}
