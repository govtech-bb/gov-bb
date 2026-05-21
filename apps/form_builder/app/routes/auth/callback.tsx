import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { getBuilderSession } from "../../server/session";
import {
  exchangeCodeForToken,
  fetchUserInfo,
} from "../../server/github-oauth";

const searchSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const Route = createFileRoute("/auth/callback")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const session = await getBuilderSession();
    const expectedState = session.data.oauthState;
    if (!expectedState || expectedState !== search.state) {
      // CSRF / replay protection — state must match what we issued at /auth/login.
      await session.clear();
      throw redirect({ to: "/auth/login" });
    }

    const { accessToken, expiresAt } = await exchangeCodeForToken(search.code);
    const { login, teamMemberships } = await fetchUserInfo(accessToken);

    await session.update({
      githubLogin: login,
      accessToken,
      teamMemberships,
      expiresAt,
      oauthState: undefined,
    });

    throw redirect({ to: "/builder" });
  },
});
