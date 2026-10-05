import {
  Footer,
  FooterLink,
  Header,
  Link as GovLink,
  LinkButton,
  OfficialBanner,
  SkipLink,
  StatusBanner,
} from "@govtech-bb/react";
import govBbLogoUrl from "@govtech-bb/frontend/assets/images/govbb-logo.svg?url";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
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

/*
 * The live site's chrome, from the same design-system components
 * apps/landing assembles it from, so the spike's pages can be compared with
 * alpha.gov.bb side by side. The nav and footer links keep the live site's
 * paths; most of them are not pages here.
 */
function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="govbb-page">
        <SkipLink href="#main-content" />
        <OfficialBanner
          imageSrc="/images/coat-of-arms.png"
          imageAlt=""
          showLearnMore={false}
        />
        <Header
          homeHref="/"
          logoAlt="Go to the alpha.gov.bb homepage"
          logoSrc={govBbLogoUrl}
          nav={
            <>
              <GovLink href="/services">Services</GovLink>
              <GovLink href="/track">Track my application</GovLink>
              <LinkButton href="/chat">Ask Assistant</LinkButton>
            </>
          }
          navAriaLabel="Primary navigation"
        />
        <StatusBanner variant="alpha" fullWidth>
          <p>
            This page is in{" "}
            <GovLink href="/what-we-mean-by-alpha">Alpha</GovLink>.
          </p>
        </StatusBanner>
        {children}
        <Footer
          coatSrc="/images/coat-of-arms.png"
          copy={`© ${new Date().getFullYear()} Government of Barbados`}
        >
          <FooterLink href="/">Home</FooterLink>
          <FooterLink href="/terms-conditions">Terms & Conditions</FooterLink>
          <FooterLink href="https://job-boards.greenhouse.io/govtechbarbados">
            Careers
          </FooterLink>
        </Footer>
        <Scripts />
      </body>
    </html>
  );
}
