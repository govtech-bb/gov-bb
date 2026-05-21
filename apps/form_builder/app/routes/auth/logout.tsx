import { createFileRoute, redirect } from "@tanstack/react-router";
import { signOut } from "../../server/auth";

export const Route = createFileRoute("/auth/logout")({
  beforeLoad: async () => {
    await signOut();
    throw redirect({ to: "/auth/login" });
  },
});
