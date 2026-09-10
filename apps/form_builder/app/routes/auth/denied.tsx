import { Elevated } from "../../components/ui/surface";
import { Button } from "../../components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logoutSession } from "../../server/auth";
import { getRepoDisplay } from "../../server/github-repo";

/**
 * Optional `?reason=csrf` tells this page to render recovery-oriented copy for
 * an expired/mismatched OAuth state (thrown from the callback route), instead
 * of the default "no write access" message.
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
 * Clear the session cookie (CSRF-safe POST RPC), then restart the OAuth flow.
 *
 * We use a full-page navigation (`window.location.assign`) rather than the
 * router's client-side navigate: `/auth/github`'s `beforeLoad` sets the CSRF
 * state cookie via a server-only `setResponseHeader`, which no-ops under
 * client navigation. A hard navigation makes that `beforeLoad` run on the
 * server so the cookie is actually written before we bounce to GitHub.
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
    <main className="flex min-h-dvh items-center justify-center bg-ui-canvas p-6 font-sans text-ui-default">
      <Elevated
        offset={1}
        shadowLevel={2}
        className="max-w-xl space-y-4 rounded-xl p-8 [&_h1]:text-xl [&_h1]:font-semibold [&_p]:leading-relaxed"
      >
        {isCsrf ? (
          <>
            <h1 style={{ marginTop: 0 }}>Sign-in link expired</h1>

            <p>
              Your sign-in link expired or didn&rsquo;t match. Please sign in
              again.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ marginTop: 0 }}>Access denied</h1>

            <p>
              You don&rsquo;t have write access to{" "}
              <code>{owner ? `${owner}/${name}` : name}</code>. Ask an admin to
              add you as a collaborator with at least <strong>Write</strong>{" "}
              permission, then sign in again.
            </p>
          </>
        )}
        <p>
          <Button
            type="button"
            onClick={() => void logoutAndRestart()}
            variant="secondary"
            size="sm"
          >
            {isCsrf ? "Sign in again" : "Try a different account"}
          </Button>
        </p>
      </Elevated>
    </main>
  );
}
