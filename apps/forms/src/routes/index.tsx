import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchFormDefinitions } from "@forms/form-api";

export const Route = createFileRoute("/")({
  component: Index,
  loader: () => fetchFormDefinitions(),
});

function Index() {
  const forms = Route.useLoaderData();

  return (
    <div>
      <h1 className="govbb-text-h1 mb-6">Forms</h1>
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
    </div>
  );
}
