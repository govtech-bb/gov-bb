import { createFileRoute, redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
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

// Clear the session cookie on the route's own response so the Set-Cookie rides
// the same 302 the browser follows. The session cookie is HttpOnly and can
// only be cleared server-side; the client branch is intentionally a no-op
// (callers must reach /auth/logout via full-page navigation for it to work).
// `createIsomorphicFn` is the documented hook to keep the server-only import
// out of the client bundle (see import-protection plugin in @tanstack/start).
const clearSessionCookie = createIsomorphicFn()
  .server((secure: boolean) => {
    setResponseHeader("Set-Cookie", clearSession({ secure }));
  })
  .client((_secure: boolean) => {});

export const Route = createFileRoute("/auth/logout")({
  validateSearch: (search) => SearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    const base = process.env.OAUTH_REDIRECT_BASE ?? "";
    const secure = base.startsWith("https://");
    clearSessionCookie(secure);
    throw redirect({ href: sanitizeNext(search.next) });
  },
});
