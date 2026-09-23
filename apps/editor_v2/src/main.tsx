import { getDb, type SpikeDb } from "@govtech-bb/spike-db";
import { ApiProvider, SpikeDbProvider } from "@govtech-bb/spike-db/react";
import {
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@govtech-bb/block-kit/styles.css";
import "./styles.css";
import { editorRoutes } from "./editor/routes";
import { Chrome } from "./chrome";
import { StoreBridge } from "./editor/store-bridge";

const rootRoute = createRootRoute({
  component: () => (
    <Chrome>
      <StoreBridge />
      <Outlet />
    </Chrome>
  ),
});

/*
 * The editor only.
 *
 * The site used to be mounted here as a second route tree, on one origin,
 * because PGlite's IndexedDB is scoped per origin and neither app could see
 * the other's data otherwise. With `api_v2` serving both over HTTP that
 * constraint is gone, and the two want opposite things: a citizen's page
 * should arrive as finished HTML from a server, and an authoring surface
 * with a rich text editor and local drafts gains nothing from being rendered
 * on one. The site is `apps/landing_v2` now, server-rendered.
 */
const router = createRouter({
  routeTree: rootRoute.addChildren([...editorRoutes(rootRoute)]),
  defaultPreload: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * Which backend the apps run against.
 *
 * Set `VITE_API_URL` and both trees read and write `apps/api_v2` over HTTP;
 * leave it unset and they keep the browser-local PGlite the spike was built
 * on. Two backends rather than a migration because they answer different
 * questions — PGlite proved the document format could be edited and rendered
 * with no server at all, and the API is what makes the content outlive one
 * browser profile.
 */
const API_URL = import.meta.env.VITE_API_URL as string | undefined;

/**
 * Against the API there is no WASM Postgres to compile and no seed to run, so
 * the tree renders immediately. The `db-ready` marker still has to appear,
 * because the whole behavioural suite waits on it.
 */
function ApiBoot() {
  return (
    <ApiProvider baseUrl={API_URL!}>
      <span data-testid="db-ready" hidden />
      <RouterProvider router={router} />
    </ApiProvider>
  );
}

function Boot() {
  const [db, setDb] = useState<SpikeDb | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Async by construction. This is the whole reason PGlite replaced the
    // earlier localStorage plan: there is no synchronous read to reach for
    // in a render path or a useState initialiser, so the shape that would
    // have to be unpicked the day this becomes `fetch` is not available.
    getDb().then((ready) => {
      // Spike convenience: the console is the fastest way to ask the
      // database a question while building. Never ships anywhere.
      (window as unknown as { db: SpikeDb }).db = ready;
      setDb(ready);
    }, setError);
  }, []);

  if (error) {
    return (
      <div className="boot boot-error">
        <h1>The database did not start</h1>
        <pre>{error.message}</pre>
      </div>
    );
  }

  if (!db) return <div className="boot">Starting Postgres…</div>;

  return (
    <SpikeDbProvider db={db}>
      {/*
        The signal the behavioural suite waits on. PGlite compiles WASM and
        runs the migration and seed before this point, so without it every
        test races the boot and fails as a puzzling selector timeout.
      */}
      <span data-testid="db-ready" hidden />
      <RouterProvider router={router} />
    </SpikeDbProvider>
  );
}

/**
 * No <StrictMode>.
 *
 * StrictMode double-invokes effects in development: mount, unmount, mount.
 * `useLiveQuery` unsubscribes in its cleanup, and PGlite's live-query
 * teardown races the immediately-following resubscribe over the worker RPC,
 * leaving a subscription that never delivers its initial results. The
 * symptom is a hook that stays `undefined` forever, on some pages and not
 * others depending on how many live queries a component mounts.
 *
 * Worth recording: it is a real integration wrinkle for anything building
 * on PGlite's React bindings, and it is a development-only behaviour, so it
 * would not have shown up in a production build.
 */
createRoot(document.getElementById("root")!).render(
  API_URL ? <ApiBoot /> : <Boot />,
);
