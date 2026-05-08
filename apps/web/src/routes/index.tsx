import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchFormDefinitions } from "@web/form-api";

export const Route = createFileRoute("/")({
  component: Index,
  loader: () => fetchFormDefinitions(),
});

function Index() {
  const forms = Route.useLoaderData();

  return (
    <div>
      <h3>Welcome GovTech!</h3>
      <div>
        <ul>
          {forms.map(({ formId, title }) => (
            <li key={formId}>
              <Link to="/forms/$formId" params={{ formId }}>
                {title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
