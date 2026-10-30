import type { ReactNode, SyntheticEvent } from "react";
import {
  Breadcrumbs,
  Feedback,
  Footer,
  FooterLink,
  Header,
  Heading,
  Link,
  LinkButton,
  OfficialBanner,
  SkipLink,
  StatusBanner,
  Text,
} from "@govtech-bb/react";
import { renderMarkdownNodes, type MarkdownComponents } from "@govtech-bb/govbbmarkd/react";
import crest from "@govtech-bb/frontend/assets/images/govbb-crest.svg?url";
import logo from "@govtech-bb/frontend/assets/images/govbb-logo.svg?url";
import styles from "./prose-page.css?inline";
import type { PreparedProsePage } from "./prose-page-content";

// Rehome the package's document defaults on this page, without touching the editor stylesheet.
const proseStyles = `@scope ([data-cms-site-preview]) to ([data-cms-editor-controls]) { ${styles.replaceAll(":root", ":scope").replaceAll(":host", ":scope").replaceAll(":where(body)", ":scope")} }`;

/** The editor supplies its existing fields; the template never creates an editor or draft store. */
export type ProsePageRegions = { title: ReactNode; lede: ReactNode; body: ReactNode };

function blockPreviewAction(event: SyntheticEvent) {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest("a, form")) return;
  event.preventDefault();
  event.stopPropagation();
  const href = target.closest("a")?.getAttribute("href");
  if (event.type === "click" && href?.startsWith("#")) {
    const destination = document.getElementById(href.slice(1));
    if (destination && event.currentTarget.contains(destination)) {
      destination.scrollIntoView();
      destination.focus({ preventScroll: true });
    }
  }
}

/** Public prose-page presentation, built locally from the design system and shared Markdown renderer. */
export function ProsePage({
  page,
  editableRegions,
}: {
  page: PreparedProsePage;
  editableRegions?: ProsePageRegions;
}) {
  const markdownComponents: MarkdownComponents = {
    a: ({ node, href, children, ...rest }) => {
      if (node?.properties.dataStartLink !== undefined) {
        const { "data-start-link": _start, "data-form-id": _form, ...linkProps } = rest;
        const available =
          page.formStatus === "available" && node.properties.dataFormId === page.formId;
        return href || available ? (
          <LinkButton {...linkProps} href={href ?? "#"}>
            {children}
          </LinkButton>
        ) : null;
      }
      if (node?.properties.className?.includes("anchor-heading"))
        return <a href={href ?? "#"} {...rest} />;
      const external = href && !/^(\/|#|tel:)/.test(href);
      return (
        <Link
          href={href ?? "#"}
          {...(external ? { rel: "noopener noreferrer", target: "_blank" } : undefined)}
          {...rest}
        >
          {children}
        </Link>
      );
    },
    img: ({ node: _node, src, ...rest }) => (
      <img
        {...rest}
        src={src?.startsWith("/images/") ? new URL(src, "https://alpha.gov.bb").href : src}
      />
    ),
  };
  return (
    <div
      data-cms-site-preview=""
      onClickCapture={blockPreviewAction}
      onAuxClickCapture={blockPreviewAction}
      onSubmitCapture={blockPreviewAction}
    >
      <style data-cms-preview-styles="">{proseStyles}</style>
      <SkipLink href="#cms-site-content" />
      <div className="print:hidden">
        <OfficialBanner imageSrc={crest} imageAlt="" showLearnMore={false} />
        <Header
          homeHref="/"
          logoAlt="Go to the alpha.gov.bb homepage"
          logoSrc={logo}
          navAriaLabel="Primary navigation"
          nav={
            <>
              <Link href="/services">Services</Link>
              <Link href="#">Track my application</Link>
              <LinkButton href="#">Ask Assistant</LinkButton>
            </>
          }
        />
        <StatusBanner variant="alpha" fullWidth>
          <p>
            This page is in <Link href="/what-we-mean-by-alpha">Alpha</Link>.
          </p>
        </StatusBanner>
      </div>
      <div className="govbb-width-container pt-4 print:hidden lg:pt-6">
        <Breadcrumbs items={page.breadcrumbs} collapseOnMobile />
      </div>
      <main id="cms-site-content" tabIndex={-1}>
        <div className="govbb-width-container govbb-main-wrapper">
          {page.formStatus === "maintenance" && (
            <StatusBanner variant="service" className="mb-s" rounded>
              <p>
                This form is currently being upgraded to serve you better. Please check back soon.
              </p>
            </StatusBanner>
          )}
          {page.formStatus === "closed" && (
            <StatusBanner variant="service" className="mb-s" rounded>
              <p>Applications for this service have closed.</p>
            </StatusBanner>
          )}
          <div data-cms-preview-article="" className="mb-xm lg:grid lg:grid-cols-3 lg:gap-16">
            <div className="space-y-6 lg:col-span-2 lg:space-y-8">
              <div className="space-y-4 lg:space-y-6">
                <Heading as="h1" className="wrap-anywhere">
                  {editableRegions?.title ?? page.title}
                </Heading>
                {page.sourceUrl && (
                  <StatusBanner variant="migrated" rounded>
                    <p>
                      This page was originally published on{" "}
                      <Link href="https://www.gov.bb" external>
                        gov.bb
                      </Link>
                      . It may be out of date or shown differently here.
                    </p>
                    <p>
                      <Link href={page.sourceUrl} external>
                        View the original source
                      </Link>
                    </p>
                  </StatusBanner>
                )}
                {(page.publishDate || page.lede || editableRegions) && (
                  <div className="flex flex-col gap-xs">
                    {page.publishDate && (
                      <div className="border-blue-10 border-b-4 pb-4 text-grey-70">
                        <Text as="p" size="body-sm">
                          Last updated on {page.publishDate}
                        </Text>
                      </div>
                    )}
                    {(page.lede || editableRegions) && (
                      <Text as="p" className="text-grey-70">
                        {editableRegions?.lede ?? page.lede}
                      </Text>
                    )}
                  </div>
                )}
              </div>
              {editableRegions?.body ?? (
                <div className="govbb-prose">
                  {renderMarkdownNodes(page.hast.children, markdownComponents)}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="govbb-width-container print:hidden">
          <Feedback className="mb-4 lg:mb-16" heading="Was this helpful?">
            <Text as="p">Give us your feedback about this page.</Text>
            <Link href="/feedback">Help us improve alpha.gov.bb</Link>
          </Feedback>
        </div>
      </main>
      <Footer
        className="print:hidden"
        coatSrc={crest}
        copy={`© ${new Date().getFullYear()} Government of Barbados`}
      >
        <FooterLink href="/">Home</FooterLink>
        <FooterLink href="/terms-conditions">Terms &amp; Conditions</FooterLink>
        <FooterLink href="https://job-boards.greenhouse.io/govtechbarbados">Careers</FooterLink>
      </Footer>
    </div>
  );
}
