import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { api } from "../api-client";
import { requireSession } from "../auth/require-session";

export const createAiAccess = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .handler(async ({ context }) => {
    const origin = getRequestUrl().origin;
    const { token } = await api.post<{ token: string }>("/builder/ai/access", {
      subject: context.session.login,
      origin,
    });
    const baseUrl = process.env.BUILDER_API_URL;
    if (!baseUrl) throw new Error("The AI service is not configured.");
    return { token, url: baseUrl.replace(/\/$/, "") + "/builder/ai" };
  });
