import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { handleGitHubCallback } from "../../server/auth";

const QuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const Route = createFileRoute("/auth/github/callback")({
  validateSearch: (search) => QuerySchema.parse(search),
  beforeLoad: async ({ search }) => {
    const result = await handleGitHubCallback({ data: search });
    if (result.denied) {
      throw redirect({ to: "/auth/denied" });
    }
    throw redirect({ to: "/builder" });
  },
});
