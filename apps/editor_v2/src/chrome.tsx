import type { ReactNode } from "react";

/** Where the server-rendered site is served from. */
const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string) ?? "http://localhost:3030";

/**
 * The banner, and the way across to the site.
 *
 * The site is a separate origin now, so this is a plain anchor rather than a
 * router link — there is no route here to navigate to.
 */
export function Chrome({ children }: { children: ReactNode }) {
  return (
    <div className="app app-editor">
      <header className="app-bar">
        <span className="app-mark">GOV.BB</span>
        <span className="app-tag">Editor</span>
        <nav className="app-nav">
          <a href={SITE_URL}>View the site</a>
        </nav>
        <span className="app-note">Spike · local Postgres · not for merge</span>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
