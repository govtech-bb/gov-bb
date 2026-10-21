import {
  ClientOnly,
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { EditorApi } from "../api/client";
import type { EditorAuth } from "../auth/session";
import stylesheet from "../../index.css?url";
import { EmptyState } from "../ui/empty-state";
import { AuthPending } from "../auth/auth-screen";
import { RouteError } from "../route-error";
import { TextLink } from "../ui/text-link";
import { Toaster } from "../ui/toast";
import { ScreenTitle } from "../workspace/screen-title";

/** Static document with explicit runtime dependencies supplied by getRouter; route loaders fill its query client. */
export const Route = createRootRouteWithContext<{
  auth: EditorAuth;
  api: EditorApi;
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: () => (
    <ClientOnly fallback={<AuthPending label="Loading editor…" />}>
      <Outlet />
      <Toaster />
    </ClientOnly>
  ),
  shellComponent: RootDocument,
  errorComponent: (props) => (
    <main>
      <RouteError {...props} />
    </main>
  ),
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* The editor's name, the tab's title until a screen names it: that title, mounted later, comes first */}
        <ScreenTitle names={[]} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <main>
      <ScreenTitle names={["Page not found"]} />
      <EmptyState
        kind="not-found"
        size="page"
        title="Page not found"
        description="If you typed the address, check it is correct."
        actions={<TextLink render={<Link to="/services" />}>Go to Services</TextLink>}
      />
    </main>
  );
}
