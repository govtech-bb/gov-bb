import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { trackPageview } from "./lib/analytics";

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

// Create a new router instance, injecting the queryClient so every route
// loader can reach it via `context.queryClient` without importing the
// singleton directly.
const router = createRouter({
  routeTree,
  context: { queryClient },
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
       * QueryClientProvider must wrap RouterProvider so that useSuspenseQuery /
       * useQuery calls inside route components reach the same QueryClient that
       * the loaders used for prefetching.
       */}
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
