import "../components/ui/ui.css";
import { ConfirmationProvider } from "../components/ui/dialog/confirmation";
import type { ReactNode } from "react";
import { GlobalAssistantProvider } from "../components/global-assistant";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Form Builder" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <ConfirmationProvider>
        <GlobalAssistantProvider>
          <Outlet />
        </GlobalAssistantProvider>
      </ConfirmationProvider>
    </RootDocument>
  );
}

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
