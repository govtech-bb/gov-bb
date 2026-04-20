import { createFileRoute } from "@tanstack/react-router";
import { FormRenderer } from "@web/components";
import { fetchContract } from "@web/lib";
import { formSearchParamSchema } from "apps/web/src/types/form-search-param.type";


export const Route = createFileRoute("/forms/$formId/")({
  component: RouteComponent,
  loader: ({ params }) => {
    return fetchContract(params.formId);
  },
  validateSearch: (search) => formSearchParamSchema.parse(search),
});

function RouteComponent() {
  const contract = Route.useLoaderData();
  const { step } = Route.useSearch();

  return <FormRenderer contract={contract} stepId={step} />;
}
