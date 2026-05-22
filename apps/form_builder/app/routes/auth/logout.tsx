import { createFileRoute, redirect } from "@tanstack/react-router";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { clearSession } from "../../server/session";

/**
 * Optional `?next=<path>` lets callers (e.g. /auth/denied's "Try a different
 * account" link) chain logout into another internal route. Only same-origin
 * paths starting with `/` (and not `//`) are honored; anything else falls
 * through to `/`.
 */
const SearchSchema = z.object({
  next: z.string().optional(),
});

function sanitizeNext(next: string | undefined): string {
  if (!next) return "/";
  // Reject protocol-relative URLs (`//evil.com`) and anything not anchored at `/`.
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export const Route = createFileRoute("/auth/logout")({
  validateSearch: (search) => SearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    const base = process.env.OAUTH_REDIRECT_BASE ?? "";
    const secure = base.startsWith("https://");
    // Clear the session cookie on THIS response, so the browser drops it
    // before following the redirect. (Doing this inside a server-function
    // handler would attach Set-Cookie to the RPC response, which the
    // redirect does not carry.)
    setResponseHeader("Set-Cookie", clearSession({ secure }));
    throw redirect({ href: sanitizeNext(search.next) });
  },
});
