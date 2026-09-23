/**
 * The HTTP backend's hooks.
 *
 * PGlite gave the spike live queries for free; over HTTP that has to be
 * built, and the first attempt built it wrong in two ways worth recording.
 *
 * It used Server-Sent Events, so every tab held one connection open forever.
 * A browser allows about six per origin, so the seventh tab's requests queued
 * behind them and never ran — a permanent "Loading…" with nothing failing and
 * nothing in any log, because the requests had never been sent. Freshness is
 * now a version token the client polls: one short request every few seconds,
 * holding nothing.
 *
 * And every hook started at `undefined`, so returning to a page already seen
 * showed "Loading…" again while the same bytes were fetched again. Results are
 * now cached across components and across navigations, and a cached value
 * renders immediately while it revalidates behind — stale-while-revalidate,
 * which is what removes the loading state rather than hiding it.
 */

import type { CollectionDefinition, PageDocument } from "@govtech-bb/block-kit";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BindingsContext,
  collectionSignature,
  SEPARATOR,
  type Bindings,
  type RenderData,
} from "./bindings";
import { HttpStore } from "./http-store";
import type { DocumentSummary } from "./store";

/**
 * One cache for the whole app, outside React.
 *
 * Module scope rather than context, deliberately: it has to survive a
 * component unmounting and remounting, which is exactly what a navigation
 * does. A cache that lives in state is emptied by the thing it exists to
 * make fast.
 */
const cache = new Map<string, unknown>();

/** In-flight requests, so ten components asking at once make one request. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * The cache survives a reload, in `sessionStorage`.
 *
 * Without this, an in-memory cache removes the loading state when moving
 * between pages and does nothing at all for a refresh — which is the moment
 * someone is most likely to be looking at it. Restoring the last known data
 * means the page paints immediately and revalidates behind; the only render
 * that can show "Loading…" is the first visit in a session.
 *
 * `sessionStorage` rather than `localStorage`: this is a convenience for the
 * tab in front of you, not a durable store, and it should not outlive the
 * session or leak content between them. Every access is wrapped, because in
 * a private window or with site data blocked these throw rather than
 * returning empty.
 */
const STORE_KEY = "spike-db.cache.v1";

function hydrate(baseUrl: string) {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as {
      baseUrl: string;
      entries: [string, unknown][];
    };
    // A different backend is a different estate; do not show one's content
    // while pointed at the other.
    if (saved.baseUrl !== baseUrl) return;
    for (const [key, value] of saved.entries) cache.set(key, value);
  } catch {
    // Unreadable or unparseable. Start empty; it is a cache.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function persist(baseUrl: string) {
  clearTimeout(persistTimer);
  // Debounced: a page load fills several keys in quick succession and one
  // write at the end is enough.
  persistTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ baseUrl, entries: [...cache.entries()] }),
      );
    } catch {
      // Over quota, or storage is unavailable. The in-memory cache still
      // works; only the survive-a-reload part is lost.
    }
  }, 250);
}

/** Cleared when the backend changes, which only happens in tests. */
export function clearCache() {
  cache.clear();
  inflight.clear();
}

async function load<T>(
  key: string,
  fetcher: () => Promise<T>,
  baseUrl: string,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return (await existing) as T;

  const request = fetcher()
    .then((value) => {
      cache.set(key, value);
      persist(baseUrl);
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return await request;
}

/**
 * A cached read, revalidated when the estate's version moves.
 *
 * Returns whatever is cached straight away — including on first render, which
 * is what stops a revisit flashing a loading state. `undefined` now means only
 * "never fetched this", and a failed revalidation keeps the last good value
 * rather than throwing the page back to "Loading…".
 */
function useCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  version: string,
  baseUrl: string,
): T | undefined {
  const [, forceRender] = useState(0);
  const latest = useRef("");

  // Read synchronously on every render: another component may have filled
  // this key since the last one.
  const value = cache.get(key) as T | undefined;

  useEffect(() => {
    const token = `${key}|${version}`;
    if (latest.current === token) return;
    latest.current = token;

    let cancelled = false;
    load(key, fetcher, baseUrl).then(
      () => {
        if (!cancelled) forceRender((n) => n + 1);
      },
      () => {
        // Keep whatever is cached. A network blip should not empty the page.
      },
    );

    return () => {
      cancelled = true;
    };
    // `fetcher` is a new closure each render; `key` identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, baseUrl]);

  return value;
}

/**
 * The estate's version, polled.
 *
 * Polling rather than a stream because a stream costs a connection per tab
 * and a browser has about six. Two seconds is fast enough that an editor
 * saving in one tab sees the site update in another without thinking about
 * it, and slow enough to be unnoticeable.
 */
function useVersion(baseUrl: string, intervalMs = 2000): string {
  const [version, setVersion] = useState("0");

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      try {
        const response = await fetch(`${baseUrl}/version`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const next = await response.json();
        const token = `${next.count}:${next.latest ?? ""}`;
        // Only re-render when it actually moved.
        if (!stopped)
          setVersion((current) => (current === token ? current : token));
      } catch {
        // Offline, or the server is restarting. Keep the cached view and
        // try again on the next tick.
      }
    };

    void check();
    const timer = setInterval(check, intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [baseUrl, intervalMs]);

  return version;
}

function buildBindings(
  store: HttpStore,
  version: string,
  baseUrl: string,
): Bindings {
  return {
    useStore: () => store,

    // Deliberately absent over HTTP: see the note on `Bindings.useReset`.
    useReset: () => null,

    useDocumentList: () =>
      useCached<DocumentSummary[]>(
        "pages",
        () => store.list(),
        version,
        baseUrl,
      ),

    useDocument: (id) =>
      useCached<PageDocument | null>(
        `page:${id ?? ""}`,
        () => (id ? store.get(id) : Promise.resolve(null)),
        version,
        baseUrl,
      ),

    useDocumentByUrl: (url) =>
      useCached<PageDocument | null>(
        `url:${url}`,
        () => store.getByUrl(url),
        version,
        baseUrl,
      ),

    useCollections: () =>
      useCached<CollectionDefinition[]>(
        "collections",
        () => store.listCollections(),
        version,
        baseUrl,
      ),

    useCollectionRecords: (key) =>
      useCached<Array<Record<string, unknown>>>(
        `records:${key ?? ""}`,
        () => (key ? store.records(key) : Promise.resolve([])),
        version,
        baseUrl,
      ),

    useCollectionRows: (key) =>
      useCached<Array<{ record_key: string; data: Record<string, unknown> }>>(
        `rows:${key ?? ""}`,
        () => (key ? store.recordRows(key) : Promise.resolve([])),
        version,
        baseUrl,
      ),

    useRenderData: (doc): RenderData => {
      const signature = useMemo(() => collectionSignature(doc), [doc]);
      const keys = useMemo(
        () => (signature === "" ? [] : signature.split(SEPARATOR)),
        [signature],
      );

      const fetcher = useCallback(async () => {
        const grouped: Record<string, Array<Record<string, unknown>>> = {};
        await Promise.all(
          keys.map(async (key) => {
            grouped[key] = await store.records(key);
          }),
        );
        return grouped;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [signature]);

      const fetched = useCached<Record<string, Array<Record<string, unknown>>>>(
        `render:${signature}`,
        fetcher,
        version,
        baseUrl,
      );

      return useMemo(() => {
        const grouped: Record<string, Array<Record<string, unknown>>> = {};
        for (const key of keys) grouped[key] = fetched?.[key] ?? [];
        return { data: grouped, loading: keys.length > 0 && !fetched };
      }, [keys, fetched]);
    },
  };
}

export function ApiProvider({
  baseUrl,
  children,
}: {
  baseUrl: string;
  children: ReactNode;
}) {
  // Restored before the first render, so a reload paints from the last known
  // data rather than from nothing.
  useState(() => hydrate(baseUrl));

  const store = useMemo(() => new HttpStore(baseUrl), [baseUrl]);
  const version = useVersion(baseUrl);
  const bindings = useMemo(
    () => buildBindings(store, version, baseUrl),
    [store, version, baseUrl],
  );

  return (
    <BindingsContext.Provider value={bindings}>
      {children}
    </BindingsContext.Provider>
  );
}

export { HttpStore };
