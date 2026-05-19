import { createFileRoute } from "@tanstack/react-router";
import { getCatalogFn } from "../../server/registry";
import { listForms } from "../../server/forms";

export const Route = createFileRoute("/builder/")({
  loader: async () => {
    const [catalog, forms] = await Promise.all([
      getCatalogFn(),
      listForms(),
    ]);
    return { catalog, forms };
  },
  component: BuilderPage,
});

function BuilderPage() {
  return <div data-testid="builder-placeholder">Form Builder (coming soon)</div>;
}
