import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { parseAuthSearch } from "../auth/session";

/** Public recovery and OAuth completion route; it never guards itself. */
export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: parseAuthSearch,
  beforeLoad: async ({ context, search, preload }) => {
    if (preload || search.state === "signed-out") return {};

    if (search.state === "error") return { failure: search.reason };

    if (search.state === "complete") {
      const session = await context.auth.session();

      if (!session.ok) return { failure: session.error.reason };

      if (!session.value) return { failure: "session" as const };
      throw redirect({ href: search.returnTo, replace: true });
    }

    const result = await context.auth.signIn(window.location.origin, search.returnTo);

    if (!result.ok) return { failure: result.error.reason };
    window.location.replace(result.value);

    return {};
  },
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const { failure } = Route.useRouteContext();
  const navigate = useNavigate();
  const signedOut = search.state === "signed-out";
  const pending = !signedOut && !failure;

  const message =
    failure === "session"
      ? "Your sign-in could not be confirmed. Allow cookies for the editor and API, then try again."
      : failure === "unavailable"
        ? "We could not reach the sign-in service. Your browser drafts have been kept. Try again when the service is available."
        : "Sign-in was not completed. Use your govtech.bb Google Workspace account to continue.";

  return (
    <main className="mx-auto max-w-160 px-6 py-12 text-ink">
      <h1 className="text-28 font-semibold">
        {signedOut ? "You are signed out" : pending ? "Signing you in…" : "Unable to sign in"}
      </h1>
      <p role={pending ? "status" : failure ? "alert" : undefined} className="my-4">
        {signedOut
          ? "Your drafts remain in this browser."
          : pending
            ? "Opening Google to sign in with your work account."
            : message}
      </p>
      {!pending && (
        <Button
          variant="accent"
          onClick={() =>
            void navigate({ to: "/auth", search: { ...search, state: "sign-in" }, replace: true })
          }
        >
          {signedOut ? "Sign in again" : "Try again"}
        </Button>
      )}
    </main>
  );
}
