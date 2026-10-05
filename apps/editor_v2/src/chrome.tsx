import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "./ui/cn";
import { GovtBarbadosWordmark } from "./ui/GovtBarbadosWordmark";

/** Where the server-rendered site is served from. */
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string) ?? "http://localhost:3030";

const MAIN_CONTENT_ID = "main-content";

/**
 * case-management's AppShell: a navy brand strip, then a white nav strip
 * with a blue underline on the active item. There is no viewer or sign-out
 * yet — writes are unauthenticated until #2701 — so the right of the brand
 * strip says so and offers the way across to the site.
 *
 * The site is a separate origin, so that is a plain anchor rather than a
 * router link — there is no route here to navigate to.
 */
export function Chrome({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Everything under /editor is browsing services, their pages or the
  // collections listed alongside them.
  const nav = [{ to: "/editor", label: "Services" }];

  return (
    <div className="min-h-screen flex flex-col bg-white-00 text-black-00">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="fixed left-s top-s z-50 -translate-y-[200%] focus:translate-y-0 border-2 border-blue-00 bg-white-00 px-s py-xs text-caption font-bold text-blue-00 focus:outline-2 focus:outline-offset-2 focus:outline-teal-100"
      >
        Skip to main content
      </a>

      <div className="bg-blue-00 text-white-00">
        <div className="container flex h-16 items-center gap-m">
          <Link
            to="/editor"
            className="flex items-center gap-s focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-100"
            aria-label="Government of Barbados Content Editor — home"
          >
            <GovtBarbadosWordmark className="h-7 w-auto text-white-00" />
            <span aria-hidden className="h-4 w-px bg-blue-40/60" />
            <span className="font-normal text-blue-40 text-caption">
              Content Editor
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-m text-caption">
            <span className="text-blue-40 text-caption-sm">
              Spike · not for merge
            </span>
            <a
              href={SITE_URL}
              className="pl-m border-l border-blue-40/30 font-bold text-white-00 hover:text-teal-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-100"
            >
              View the site
            </a>
          </div>
        </div>
      </div>

      <div className="bg-white-00 border-b border-grey-00">
        <div className="container flex items-stretch h-11">
          <nav
            className="flex items-stretch gap-xm text-caption"
            aria-label="Primary"
          >
            {nav.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex items-center transition-colors",
                    active
                      ? "text-blue-00 font-bold"
                      : "text-mid-grey-00 hover:text-blue-00",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100",
                  )}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 -bottom-px h-[2px] bg-blue-100"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="flex-1 py-m focus:outline-none"
      >
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
