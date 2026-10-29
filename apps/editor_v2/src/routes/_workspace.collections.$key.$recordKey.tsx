import { createFileRoute, redirect } from "@tanstack/react-router";

/** A record's own address, which sign-in can return to: its collection, with the record's dialog open. */
export const Route = createFileRoute("/_workspace/collections/$key/$recordKey")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/collections/$key",
      params: { key: params.key },
      search: { record: params.recordKey },
      replace: true,
    });
  },
});
