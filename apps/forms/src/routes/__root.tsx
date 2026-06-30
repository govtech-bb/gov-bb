import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Footer, OfficialBanner } from "@govtech-bb/react";
import { NotFound } from "@forms/components";
import type { QueryClient } from "@tanstack/react-query";
import { LANDING_URL } from "../config/landing";
import { SiteHeader } from "../components/site-header";

/**
 * Router context shape.  The QueryClient is injected here from main.tsx so
 * every route loader can call `context.queryClient.ensureQueryData()` without
 * importing the singleton directly.
 */
export interface RouterContext {
  queryClient: QueryClient;
}

// Footer "go home" links point at landing, not at forms' own root — a citizen
// mid-form needs a way back to the rest of alpha.gov.bb. See #1357.
const FOOTER_LINKS = [
  { label: "Home", href: `${LANDING_URL}/` },
  { label: "Terms & Conditions", href: `${LANDING_URL}/terms-conditions` },
];

const RootLayout = () => (
  <div className="flex min-h-dvh flex-col bg-white-00">
    <HeadContent />
    {/* Skip-to-content link (#341/#321): the first focusable element, hidden
        until focused, lets keyboard users bypass the banner/header and jump
        straight to <main>. `.govbb-visually-hidden-focusable` ships with
        @govtech-bb/styles. */}
    <a href="#main-content" className="govbb-visually-hidden-focusable">
      Skip to main content
    </a>
    <OfficialBanner
      imageSrc="/images/coat-of-arms.png"
      imageAlt=""
      showLearnMore={false}
    />
    <SiteHeader />
    <main id="main-content" className="flex-1">
      <Outlet />
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
