import { createFileRoute } from "@tanstack/react-router";
import { parsePeopleSearch } from "../workspace/people-search";

/**
 * The People screen: who has signed in and their roles, for someone who may see them. `?person=<id>` opens that
 * person's panel.
 */
export const Route = createFileRoute("/_workspace/people")({
  validateSearch: parsePeopleSearch,
});
