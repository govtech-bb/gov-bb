import { createFileRoute, redirect } from "@tanstack/react-router";
import * as crypto from "node:crypto";
import { getBuilderSession } from "../../server/session";
import { buildAuthorizeUrl } from "../../server/github-oauth";

export const Route = createFileRoute("/auth/login")({
  beforeLoad: async () => {
    const state = crypto.randomBytes(16).toString("hex");
    const session = await getBuilderSession();
    await session.update({ oauthState: state });
    throw redirect({
      href: buildAuthorizeUrl(state),
      statusCode: 302,
    });
  },
});
