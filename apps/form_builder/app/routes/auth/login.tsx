import { createFileRoute, redirect } from "@tanstack/react-router";
import { beginLogin } from "../../server/auth";

export const Route = createFileRoute("/auth/login")({
  beforeLoad: async () => {
    const { authorizeUrl } = await beginLogin();
    throw redirect({ href: authorizeUrl, statusCode: 302 });
  },
});
