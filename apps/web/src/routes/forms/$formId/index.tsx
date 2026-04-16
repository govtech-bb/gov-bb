import { createFileRoute } from "@tanstack/react-router";
import { fetchContract } from "@web/lib";

export const Route = createFileRoute("/forms/$formId/")({
  component: RouteComponent,
  loader: ({ params }) => {
    return fetchContract(params.formId);
  },
});

function RouteComponent() {
  const contract = Route.useLoaderData();

  return <div>Hello {contract.title}</div>;
}
