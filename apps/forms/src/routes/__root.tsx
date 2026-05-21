import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Footer } from "@govtech-bb/react";
import { NotFound } from "@forms/components";
import type { QueryClient } from "@tanstack/react-query";
import { OfficialBanner } from "../components/official-banner";
import { SiteHeader } from "../components/site-header";

/**
 * Router context shape.  The QueryClient is injected here from main.tsx so
 * every route loader can call `context.queryClient.ensureQueryData()` without
 * importing the singleton directly.
 */
export interface RouterContext {
  queryClient: QueryClient;
}

const FOOTER_LINKS = [
  { label: "Home", href: "/" },
  { label: "Terms & Conditions", href: "/terms-conditions" },
];

const RootLayout = () => (
  <div className="flex min-h-dvh flex-col bg-white-00">
    <OfficialBanner />
    <SiteHeader />
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[720px] px-4 py-8 lg:py-12">
        <Outlet />
      </div>
    </main>
    <Footer
      links={FOOTER_LINKS}
      logoSrc="/images/coat-of-arms.png"
      logoAlt="Barbados Coat of Arms"
      copyrightText={`© ${new Date().getFullYear()} Government of Barbados`}
    />
    <TanStackRouterDevtools />
  </div>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});
