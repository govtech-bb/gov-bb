import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import {
  adoptJourneyId,
  configureJourney,
  trackPageview,
} from "./lib/analytics";
import { loadUmamiScript } from "./lib/umami-script";
import "./styles/govtech.css";

import FormError from "./components/form-error";
import { ErrorBoundary } from "./components/error-boundary";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Umami Cloud analytics — only loads when VITE_UMAMI_WEBSITE_ID is set.
// Pageviews come from the router subscriber below as the single deterministic
// source; see lib/umami-script.ts for the script's settings.
loadUmamiScript(
  import.meta.env.VITE_UMAMI_WEBSITE_ID,
  import.meta.env.VITE_UMAMI_SRC,
);

// First-party journey events (alongside Umami). Off unless VITE_JOURNEY_URL is
// set for the environment. Then keep the journey ID landing's Start link passed
// in ?jid= and strip it from the address bar. This runs before the router is
// created, so the router, every page view and every logged path only ever see
// the URL without it, whichever router event counts page views.
configureJourney({ url: import.meta.env.VITE_JOURNEY_URL, app: "forms" });
adoptJourneyId();

// Surface otherwise-invisible client errors. Route/render errors are shown by
// the router's defaultErrorComponent and the top-level ErrorBoundary; these
// catch async / event-handler errors those two can't. Console only for now — a
// backend crash sink is future work (#1990).
window.addEventListener("error", (event) => {
  console.error("[forms] uncaught error:", event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[forms] unhandled promise rejection:", event.reason);
});

// Create a new router instance, injecting the queryClient so every route
// loader can reach it via `context.queryClient` without importing the
// singleton directly. defaultErrorComponent gives every route without its own
// `errorComponent` the branded FormError page instead of the router's
// unstyled default (#1990).
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultErrorComponent: FormError,
});

router.subscribe("onResolved", trackPageview);

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      {/*
       * ErrorBoundary is outermost so a throw above the router (provider setup,
       * initial render) shows the branded ErrorPage instead of a blank page.
       * QueryClientProvider must wrap RouterProvider so that useSuspenseQuery /
       * useQuery calls inside route components reach the same QueryClient that
       * the loaders used for prefetching.
       */}
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
