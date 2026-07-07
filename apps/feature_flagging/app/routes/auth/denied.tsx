import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logoutSession } from "../../server/auth";
import { getRepoDisplay } from "../../server/github-repo";

/**
 * Optional `?reason=csrf` renders recovery-oriented copy for an
 * expired/mismatched OAuth state (thrown from the callback route), instead of
 * the default "no access" message.
 */
const SearchSchema = z.object({
  reason: z.enum(["csrf"]).optional(),
});

export const Route = createFileRoute("/auth/denied")({
  validateSearch: (search) => SearchSchema.parse(search),
  loader: () => getRepoDisplay(),
  component: DeniedPage,
});

/**
 * Clear the session cookie (CSRF-safe POST RPC), then restart the OAuth flow
 * with a full-page navigation so `/auth/github`'s beforeLoad runs on the server
 * and can write the CSRF state cookie.
 */
async function logoutAndRestart() {
  await logoutSession();
  window.location.assign("/auth/github");
}

function DeniedPage() {
  const { reason } = Route.useSearch();
  const { owner, name } = Route.useLoaderData();
  const isCsrf = reason === "csrf";

  return (
    <div className="denied">
      <div className="denied-card">
        {isCsrf ? (
          <>
            <h1>Sign-in link expired</h1>
            <p>
              Your sign-in link expired or didn&rsquo;t match. Please sign in
              again.
            </p>
          </>
        ) : (
          <>
            <h1>Access denied</h1>
            <p>
              You don&rsquo;t have access to the service-visibility tool. Ask an
              admin to add you to the{" "}
              <code>{owner ? `${owner}` : "govtech-bb"}</code> access team (or
              grant Write on <code>{name}</code>), then sign in again.
            </p>
          </>
        )}
        <p>
          <button type="button" onClick={() => void logoutAndRestart()}>
            {isCsrf ? "Sign in again" : "Try a different account"}
          </button>
        </p>
      </div>
    </div>
  );
}
