import { createFileRoute } from "@tanstack/react-router";
import { parseServicesSearch } from "../workspace/services-search";

/** The Services list keeps its search, filters, sort and page in its address. */
export const Route = createFileRoute("/_workspace/services")({
  validateSearch: parseServicesSearch,
});
