import { createFileRoute, redirect } from "@tanstack/react-router";
import { logoutSession } from "../../server/auth";

export const Route = createFileRoute("/auth/logout")({
  beforeLoad: async () => {
    await logoutSession();
    throw redirect({ to: "/" });
  },
});
