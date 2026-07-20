import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { trackPageview } from "./lib/analytics";
// GOV.BB design system — compiled, class-based stylesheet (govbb-* classes).
// Loaded before the app's Tailwind entry so app tokens/chrome utilities win.
import "@govtech-bb/styles";
import "./styles/govtech.css";

import FormError from "./components/form-error";
import { ErrorBoundary } from "./components/error-boundary";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Umami Cloud analytics — only loads when VITE_UMAMI_WEBSITE_ID is set.
// data-auto-track="false" so pageviews come from the router subscriber
// below as the single deterministic source.
const umamiWebsiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
if (umamiWebsiteId) {
  const script = document.createElement("script");
  script.src =
    import.meta.env.VITE_UMAMI_SRC ?? "https://cloud.umami.is/script.js";
  script.defer = true;
  script.dataset.websiteId = umamiWebsiteId;
  script.dataset.autoTrack = "false";
  document.head.appendChild(script);
}

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
