import {
  ClientOnly,
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { EditorAuth } from "../auth/session";
import stylesheet from "../../index.css?url";

/** Static document with explicit runtime dependencies supplied by getRouter. */
export const Route = createRootRouteWithContext<{ auth: EditorAuth }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GovBB service editor" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: () => (
    <ClientOnly
      fallback={
        <p role="status" className="p-6">
          Loading editor…
        </p>
      }
    >
      <Outlet />
    </ClientOnly>
  ),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
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
    <main className="p-6">
      <h1 className="mb-4 text-xl font-bold">Page not found</h1>
      <Link to="/services" className="underline">
        Go to Services
      </Link>
    </main>
  );
}
