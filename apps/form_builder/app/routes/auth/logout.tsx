import { createFileRoute, redirect } from "@tanstack/react-router";
import { getBuilderSession } from "../../server/session";

export const Route = createFileRoute("/auth/logout")({
  beforeLoad: async () => {
    const session = await getBuilderSession();
    await session.clear();
    throw redirect({ to: "/auth/login" });
  },
});
