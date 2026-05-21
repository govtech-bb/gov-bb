import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthContext } from "../server/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const auth = await getAuthContext();
    throw redirect({ to: auth.authed ? "/builder" : "/auth/login" });
  },
});
