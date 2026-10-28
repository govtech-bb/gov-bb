import { createFileRoute, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AuthPending, AuthScreen } from "../auth/auth-screen";
import { parseAuthSearch, type AuthFailure } from "../auth/session";
import { Button } from "../ui/button";
import { ScreenTitle } from "../workspace/screen-title";

/** Public sign-in and OAuth completion; only an explicit button press starts GitHub. */
export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: parseAuthSearch,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: AuthRoutePending,
  beforeLoad: async ({ context, search, preload }) => {
    if (preload) return {};

    if (search.state === "error") return { failure: search.reason };

    if (search.state !== "complete") return {};

    const session = await context.auth.session();

    if (!session.ok) return { failure: session.error.reason };

    if (!session.value) return { failure: "session" as const };
    throw redirect({ href: search.returnTo, replace: true });
  },
  component: () => <AuthPage key={JSON.stringify(Route.useSearch())} />,
});

function AuthRoutePending() {
  const completing = useRouterState({
    select: (state) => state.location.search.state === "complete",
  });

  return <AuthPending label={completing ? "Completing sign-in…" : "Loading sign-in…"} />;
}

function AuthPage() {
  const search = Route.useSearch();
  const { auth, failure: initialFailure } = Route.useRouteContext();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<AuthFailure["reason"] | undefined>(initialFailure);
  const [pending, setPending] = useState<"sign-in" | "session">();
  const busy = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);

  const signedOut = search.state === "signed-out";

  const retrySession =
    failure === "unavailable" &&
    (search.state === "complete" || (search.state === "error" && search.reason === "unavailable"));

  const heading = failure
    ? "Unable to sign in"
    : signedOut
      ? "You are signed out"
      : "Sign in to GovBB editor";

  const progress = pending === "session" ? "Checking your session…" : "Opening GitHub…";

  const message =
    failure === "session"
      ? "Your sign-in could not be confirmed. Allow cookies for the editor and API, then try again."
      : failure === "unavailable"
        ? "We could not reach the sign-in service. Check your connection and try again."
        : "Sign-in was not completed. Continue with GitHub to try again.";

  const continueSignIn = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(retrySession ? "session" : "sign-in");

    if (retrySession) {
      const session = await auth.session();

      if (session.ok && session.value) {
        await navigate({ href: search.returnTo, replace: true });
      } else if (session.ok && search.state !== "complete") {
        await navigate({ to: "/auth", search: { ...search, state: "sign-in" }, replace: true });
      } else {
        setFailure(session.ok ? "session" : session.error.reason);
      }
    } else {
      const result = await auth.signIn(window.location.origin, search.returnTo);

      if (result.ok) {
        window.location.replace(result.value);

        // Keep the action locked until the browser actually leaves for GitHub.
        return;
      }

      setFailure(result.error.reason);
    }

    busy.current = false;
    setPending(undefined);
  };

  return (
    <AuthScreen>
      <ScreenTitle names={[heading]} />
      <h1 ref={title} tabIndex={-1} className="text-28 font-semibold outline-none">
        {heading}
      </h1>
      <p className="mt-3 text-16 text-muted">
        {signedOut
          ? "Your saved pages remain on the server."
          : "Use your GitHub account with a verified email and active govtech-bb membership."}
      </p>
      <p role="alert" className="mt-4 text-14 text-error empty:hidden">
        {failure ? message : null}
      </p>
      <p role="status" className="sr-only">
        {pending ? progress : null}
      </p>
      <Button
        className="mt-6 h-auto min-h-10 max-w-full py-2 leading-normal"
        size="lg"
        variant="accent"
        pending={!!pending}
        onClick={() => void continueSignIn()}
      >
        {pending ? progress : retrySession ? "Try again" : "Continue with GitHub"}
      </Button>
    </AuthScreen>
  );
}
