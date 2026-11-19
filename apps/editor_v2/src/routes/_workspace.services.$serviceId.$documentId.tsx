import { createFileRoute } from "@tanstack/react-router";
import { primePage } from "../workspace/preload";

/** A document's screen, whose page starts loading as soon as a link to it is pointed at or followed. */
export const Route = createFileRoute("/_workspace/services/$serviceId/$documentId")({
  loader: ({ context: { queryClient, api }, params }) =>
    primePage(queryClient, api, params.serviceId, params.documentId),
});
