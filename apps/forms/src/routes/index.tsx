import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Heading, ServiceList, ServiceListItem } from "@govtech-bb/react";
import { fetchFormDefinitions } from "@forms/form-api";
import type { PublicFormSummary } from "@forms/types";
import { LANDING_URL } from "../config/landing";
import { isDevMode } from "../lib/env";

export const Route = createFileRoute("/")({
  // Outside local dev, send visitors who hit the raw forms index (`/`) to the
  // main GOV.BB site so they arrive via a proper start page, not a list of
  // every form. Reuses LANDING_URL — the single landing-site origin the header
  // and footer already link to (config/landing.ts), which defaults to prod.
  // Runs before the loader so the form definitions are never fetched and the
  // list never flashes. Skipped in dev so developers keep the index for
  // finding/opening forms. An absolute `href` makes this a full-document
  // navigation; `replace` keeps it out of history (no back-loop).
  beforeLoad: () => {
    if (!isDevMode()) {
      throw redirect({ href: LANDING_URL, replace: true });
    }
  },
  component: Index,
  loader: () => fetchFormDefinitions(),
});

/** Bucket forms with no contactDetails-derived category fall under. */
const UNKNOWN_CATEGORY = "Unknown Category";

/**
 * Group form summaries by their `category` (the contactDetails title surfaced
 * by the API). Forms with no category land in the `UNKNOWN_CATEGORY` bucket.
 * Categories are sorted alphabetically with that bucket always last.
 */
export function groupFormsByCategory(
  forms: PublicFormSummary[],
): { category: string; forms: PublicFormSummary[] }[] {
  const groups = new Map<string, PublicFormSummary[]>();
  for (const form of forms) {
    const category = form.category?.trim() || UNKNOWN_CATEGORY;
    const bucket = groups.get(category);
    if (bucket) bucket.push(form);
    else groups.set(category, [form]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === UNKNOWN_CATEGORY) return 1;
      if (b === UNKNOWN_CATEGORY) return -1;
      return a.localeCompare(b);
    })
    .map(([category, forms]) => ({ category, forms }));
}

function Index() {
  const forms = Route.useLoaderData();
  const groups = groupFormsByCategory(forms);

  return (
    <div className="govbb-width-container govbb-main-wrapper govbb-grid-row">
      <div className="govbb-grid-column-two-thirds-from-desktop">
        <Heading as="h1" className="mb-6">
          Forms
        </Heading>
        <div className="flex flex-col gap-8">
          {groups.map(({ category, forms }) => (
            <section key={category}>
              <Heading as="h2" className="mb-4">
                {category}
              </Heading>
              <ServiceList variant="signpost">
                {forms.map(({ formId, title }) => (
                  <ServiceListItem
                    key={formId}
                    href={`/forms/${encodeURIComponent(formId)}`}
                    renderLink={({ className, children }) => (
                      <Link
                        to="/forms/$formId"
                        params={{ formId }}
                        className={className}
                      >
                        {children}
                      </Link>
                    )}
                  >
                    {title}
                  </ServiceListItem>
                ))}
              </ServiceList>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
