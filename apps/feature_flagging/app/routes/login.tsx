import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SiteHeader } from "@govtech-bb/admin-ui";
import { Button } from "@govtech-bb/react";
import { logoutSession } from "../server/auth";

/**
 * `?error` is set by the OAuth callback on a failed sign-in:
 * - `denied` — authenticated, but not authorized for this tool.
 * - `csrf`   — the OAuth state cookie expired or didn't match.
 */
const SearchSchema = z.object({
  error: z.enum(["denied", "csrf"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search) => SearchSchema.parse(search),
  component: LoginPage,
});

/**
 * Start the GitHub OAuth flow with a full-page navigation so `/auth/github`'s
 * `beforeLoad` runs on the server and can set the CSRF state cookie (a
 * client-side navigate would no-op that server-only write). On a denied retry we
 * clear the existing session first so GitHub SSO can offer a different account.
 */
async function signIn(forceReauth: boolean) {
  if (forceReauth) await logoutSession();
  window.location.assign("/auth/github");
}

function LoginPage() {
  const { error } = Route.useSearch();
  const denied = error === "denied";

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader label="Service visibility" />
      <div className="flex-1 flex items-center justify-center p-m">
        <div className="w-full max-w-[460px] rounded-md border border-grey-00 bg-white-00 p-m text-center">
          <h1 className="m-0 mb-xs text-h3 font-bold">Service visibility</h1>
          <p className="mt-0 mb-xm text-caption text-mid-grey-00">
            Sign in with GitHub to view and manage the visibility of government
            services.
          </p>

          {denied && (
            <p className="mb-s rounded-sm border border-red-40 bg-red-10 px-s py-xs text-left text-caption text-red-00">
              You don&rsquo;t have access to this tool. Ask an admin to add you
              to the access team, then try again.
            </p>
          )}
          {error === "csrf" && (
            <p className="mb-s rounded-sm border border-red-40 bg-red-10 px-s py-xs text-left text-caption text-red-00">
              Your sign-in link expired or didn&rsquo;t match. Please sign in
              again.
            </p>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={() => void signIn(denied)}
          >
            {denied ? "Try a different account" : "Sign in with GitHub"}
          </Button>
        </div>
      </div>
    </div>
  );
}
