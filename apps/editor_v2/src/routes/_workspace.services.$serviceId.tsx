import { createFileRoute } from "@tanstack/react-router";
import { primeService } from "../workspace/preload";

/** A service's screen, whose service starts loading as soon as a link to it is pointed at or followed. */
export const Route = createFileRoute("/_workspace/services/$serviceId")({
  loader: ({ context: { queryClient, api }, params }) =>
    primeService(queryClient, api, params.serviceId),
});
