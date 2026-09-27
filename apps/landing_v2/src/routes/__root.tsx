import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { serverFnStatus } from "../server/status";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  // Every page request, so an unreachable api_v2 is a 503 on first load too.
  server: { middleware: [serverFnStatus] },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GOV.BB" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: () => <Outlet />,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="site-bar">
          <span className="site-mark">GOV.BB</span>
          <span className="site-tag">Site</span>
          <span className="site-note">
            Spike · server-rendered · not for merge
          </span>
        </header>
        <main className="site-main">{children}</main>
        <Scripts />
      </body>
    </html>
  );
}
