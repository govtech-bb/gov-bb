import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { PostHogProvider } from "./lib/tracking";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance, injecting the queryClient so every route
// loader can reach it via `context.queryClient` without importing the
// singleton directly.
const router = createRouter({
  routeTree,
  context: { queryClient },
});

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
        <PostHogProvider>
          <RouterProvider router={router} />
        </PostHogProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
