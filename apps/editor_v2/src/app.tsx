import { IconContext } from "@phosphor-icons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TipProvider } from "./ui/tooltip";
import { ServiceWorkspace } from "./workspace/workspace";
import type { EditorApi } from "./api/services";
import { localReturnPath, type EditorAuth, type EmployeeSession } from "./auth/session";

const icons = { weight: "bold" as const };

/** Authenticated shell; changing sessions never changes browser draft storage. */
export function App({
  auth,
  api,
  employee,
}: {
  auth: EditorAuth;
  api: EditorApi;
  employee: EmployeeSession;
}) {
  const navigate = useNavigate();
  const href = useRouterState({ select: (state) => state.location.href });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let disposed = false;
    let checking = false;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      const result = await auth.session();
      checking = false;

      if (disposed) return;
      clearTimeout(timer);

      if (!result.ok) {
        setNotice(
          "We could not check your session. Your drafts remain in this browser. Return to this window to try again.",
        );

        return;
      }

      if (!result.value) {
        // Router navigation runs the workspace's draft flush/blocker before leaving.
        await navigate({
          to: "/auth",
          search: { state: "sign-in", returnTo: localReturnPath(href), reason: "provider" },
          replace: true,
        });

        return;
      }

      setNotice("");
      timer = setTimeout(check, Math.max(0, result.value.expiresAt - Date.now()));
    };

    const focus = () => {
      void check();
    };

    timer = setTimeout(check, Math.max(0, employee.expiresAt - Date.now()));
    window.addEventListener("focus", focus);

    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, [auth, employee.expiresAt, href, navigate]);

  const signOut = async () => {
    const result = await auth.signOut();

    if (!result.ok) return "We could not sign you out. Try again when the service is available.";
    await navigate({
      to: "/auth",
      search: { state: "signed-out", returnTo: "/services", reason: "provider" },
      replace: true,
    });
  };

  return (
    <IconContext.Provider value={icons}>
      <TipProvider delay={300}>
        {notice && (
          <p role="alert" className="border-s-4 border-error bg-white px-6 py-3 text-error">
            {notice}
          </p>
        )}
        <ServiceWorkspace api={api} email={employee.email} onSignOut={signOut} />
      </TipProvider>
    </IconContext.Provider>
  );
}
