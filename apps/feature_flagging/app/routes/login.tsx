import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
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
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Service visibility</h1>
        <p className="auth-sub">
          Sign in with GitHub to view and manage the visibility of government
          services.
        </p>

        {denied && (
          <p className="auth-error">
            You don&rsquo;t have access to this tool. Ask an admin to add you to
            the access team, then try again.
          </p>
        )}
        {error === "csrf" && (
          <p className="auth-error">
            Your sign-in link expired or didn&rsquo;t match. Please sign in
            again.
          </p>
        )}

        <button
          type="button"
          className="btn-primary"
          onClick={() => void signIn(denied)}
        >
          {denied ? "Try a different account" : "Sign in with GitHub"}
        </button>
      </div>
    </div>
  );
}
