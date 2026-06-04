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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        fontFamily: "system-ui",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          maxWidth: 600,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 12,
          padding: 32,
        }}
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
              add you as a collaborator with at least{" "}
              <strong>Write</strong> permission, then sign in again.
            </p>
          </>
        )}
        <p>
          <button
            type="button"
            onClick={() => void logoutAndRestart()}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              color: "#0969da",
              font: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {isCsrf ? "Sign in again" : "Try a different account"}
          </button>
        </p>
      </div>
    </div>
  );
}
