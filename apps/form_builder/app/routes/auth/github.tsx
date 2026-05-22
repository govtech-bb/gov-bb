import { createFileRoute, redirect } from "@tanstack/react-router";
import { initiateGitHubOAuth } from "../../server/auth";

export const Route = createFileRoute("/auth/github")({
  beforeLoad: async () => {
    const { redirectUrl } = await initiateGitHubOAuth();
    throw redirect({ href: redirectUrl });
  },
});
