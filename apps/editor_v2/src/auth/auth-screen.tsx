import type { ReactNode } from "react";
import { LoadingState } from "../ui/loading-state";
import { GovbbLogo } from "../workspace/govbb-logo";
import { ScreenTitle } from "../workspace/screen-title";

/** The public entry surface stays consistent through bootstrap, session checking and sign-in. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-grey-10 px-6 py-12 text-ink">
      <div className="w-full min-w-0 max-w-120 text-center">
        <GovbbLogo fit="width" className="mb-8 inline-block w-full max-w-84" />
        {children}
      </div>
    </main>
  );
}

/** Blocking feedback is only for entering the editor, never background workspace requests. */
export function AuthPending({ label }: { label: string }) {
  return (
    <AuthScreen>
      <ScreenTitle names={[label]} />
      <LoadingState label={label} />
    </AuthScreen>
  );
}
