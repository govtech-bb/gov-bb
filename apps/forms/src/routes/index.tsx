import React from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
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
    <div className="container py-8 lg:py-16">
      <div className="form-width">
        <h1 className="govbb-text-h1 mb-6">Forms</h1>
        <div className="flex flex-col gap-8">
          {groups.map(({ category, forms }) => (
            <section key={category}>
              <h2 className="govbb-text-h2 mb-4">{category}</h2>
              <ul className="flex flex-col gap-2">
                {forms.map(({ formId, title }) => (
                  <li key={formId}>
                    <Link
                      to="/forms/$formId"
                      params={{ formId }}
                      className="group flex items-center justify-between gap-4 rounded-md border border-grey-00 bg-white-00 px-4 py-3 no-underline transition-colors hover:border-teal-00 hover:bg-teal-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100"
                    >
                      <span className="font-medium text-teal-00 group-hover:text-teal-100">
                        {title}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-teal-00 group-hover:text-teal-100"
                      >
                        &rsaquo;
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
