import { Component, type ReactNode } from "react";
import { LANDING_URL } from "../config/landing";
import { ErrorPage } from "./error-page";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort error boundary wrapping the whole app. Route-level errors are
 * handled by the router (its `defaultErrorComponent` and per-route
 * `errorComponent`); this catches anything thrown *above* the router — provider
 * setup or the initial render — that would otherwise leave a blank white page.
 * Renders the shared branded `ErrorPage` with a reload action (#1990).
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // Console only for now — a backend crash sink is future work (#1990).
    console.error("[forms] uncaught render error:", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorPage
          title="Something went wrong"
          intro="An unexpected error occurred. Please reload the page and try again."
          suggestions={["Reload the page", "Return to the homepage"]}
          secondary={{ label: "Return to homepage", href: LANDING_URL }}
          primary={{
            label: "Reload",
            onClick: () => window.location.reload(),
          }}
        />
      );
    }
    return this.props.children;
  }
}
