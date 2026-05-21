import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { completeLogin } from "../../server/auth";

const searchSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const Route = createFileRoute("/auth/callback")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const result = await completeLogin({
      data: { code: search.code, state: search.state },
    });
    if (!result.ok) {
      throw redirect({ to: "/auth/login" });
    }
    throw redirect({ to: "/builder" });
  },
});
