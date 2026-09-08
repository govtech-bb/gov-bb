import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Footer, FooterLink, SkipLink } from "@govtech-bb/react-next";
import Header from "../components/Header";
import NotFound from "../components/not-found";
import type { QueryClient } from "@tanstack/react-query";
import { LANDING_URL } from "../config/landing";

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

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <>
      <HeadContent />
      <SkipLink className="print:hidden" href="#main-content" />
      <div className="print:hidden">
        <Header />
      </div>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer
        className="print:hidden"
        coatSrc="/images/coat-of-arms.png"
        copy={`© ${new Date().getFullYear()} Government of Barbados`}
      >
        {FOOTER_LINKS.map(({ label, ...link }) => (
          <FooterLink key={label} {...link}>
            {label}
          </FooterLink>
        ))}
      </Footer>
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}
