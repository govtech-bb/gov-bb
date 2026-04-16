import { createFileRoute } from "@tanstack/react-router";
import { FormRenderer } from "@web/components";
import { fetchContract } from "@web/lib";

export const Route = createFileRoute("/forms/$formId/")({
  component: RouteComponent,
  loader: ({ params }) => {
    return fetchContract(params.formId);
  },
});

function RouteComponent() {
  const contract = Route.useLoaderData();

  return <FormRenderer contract={contract} />;
}
