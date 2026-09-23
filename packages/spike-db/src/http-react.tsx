/**
 * The HTTP backend's hooks.
 *
 * PGlite gave the spike live queries for free; over HTTP that has to be
 * built. The shape here is deliberately the smallest thing that preserves the
 * behaviour the tests assert: every hook is a fetch, and a revision counter —
 * bumped by the server's SSE change feed — is part of each fetch's dependency
 * list. A change lands, the counter moves, every subscription refetches.
 *
 * That is cruder than PGlite's per-query invalidation, which knows exactly
 * which rows moved. It refetches everything on any change. At this size that
 * is a few small requests; at estate size the feed already carries the entity
 * kind and id needed to be selective, which is why the server sends them.
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
 * One fetch, re-run when its key or the revision changes.
 *
 * `undefined` means "not here yet" and is distinct from `null`, which means
 * "asked, and there is nothing". Islands render their empty state off that
 * difference, so collapsing the two would make a finder flash "no results"
 * every time a page loaded.
 */
function useFetched<T>(
  load: () => Promise<T>,
  key: string,
  revision: number,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  const latest = useRef(0);

  useEffect(() => {
    const request = ++latest.current;
    let cancelled = false;

    load().then(
      (result) => {
        // Out-of-order responses must not overwrite a newer one. Without this
        // a slow request for the previous page can land after the current
        // one and put the old content back.
        if (!cancelled && request === latest.current) setValue(result);
      },
      () => {
        if (!cancelled && request === latest.current) setValue(undefined);
      },
    );

    return () => {
      cancelled = true;
    };
    // `load` is a fresh closure each render; `key` is what actually
    // identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  return value;
}

/**
 * The change feed.
 *
 * EventSource reconnects on its own, which matters more here than it looks:
 * a dev server restart would otherwise leave every open tab silently stale
 * with no indication that it had stopped listening.
 */
function useRevision(baseUrl: string): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const events = new EventSource(`${baseUrl}/events`);
    const bump = () => setRevision((n) => n + 1);
    events.addEventListener("change", bump);
    return () => {
      events.removeEventListener("change", bump);
      events.close();
    };
  }, [baseUrl]);

  return revision;
}

function buildBindings(store: HttpStore, revision: number): Bindings {
  return {
    useStore: () => store,

    // Deliberately absent over HTTP: see the note on `Bindings.useReset`.
    useReset: () => null,

    useDocumentList: () =>
      useFetched(() => store.list(), "pages", revision) as
        | DocumentSummary[]
        | undefined,

    useDocument: (id) =>
      useFetched(
        () => (id ? store.get(id) : Promise.resolve(null)),
        `page:${id ?? ""}`,
        revision,
      ) as PageDocument | null | undefined,

    useDocumentByUrl: (url) =>
      useFetched(() => store.getByUrl(url), `url:${url}`, revision) as
        | PageDocument
        | null
        | undefined,

    useCollections: () =>
      useFetched(() => store.listCollections(), "collections", revision) as
        | CollectionDefinition[]
        | undefined,

    useCollectionRecords: (key) =>
      useFetched(
        () => (key ? store.records(key) : Promise.resolve([])),
        `records:${key ?? ""}`,
        revision,
      ),

    useCollectionRows: (key) =>
      useFetched(
        () => (key ? store.recordRows(key) : Promise.resolve([])),
        `rows:${key ?? ""}`,
        revision,
      ),

    useRenderData: (doc): RenderData => {
      const signature = useMemo(() => collectionSignature(doc), [doc]);
      const keys = useMemo(
        () => (signature === "" ? [] : signature.split(SEPARATOR)),
        [signature],
      );

      const load = useCallback(async () => {
        const grouped: Record<string, Array<Record<string, unknown>>> = {};
        await Promise.all(
          keys.map(async (key) => {
            grouped[key] = await store.records(key);
          }),
        );
        return grouped;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [signature]);

      const fetched = useFetched(load, `render:${signature}`, revision);

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
  const store = useMemo(() => new HttpStore(baseUrl), [baseUrl]);
  const revision = useRevision(baseUrl);
  const bindings = useMemo(
    () => buildBindings(store, revision),
    [store, revision],
  );

  return (
    <BindingsContext.Provider value={bindings}>
      {children}
    </BindingsContext.Provider>
  );
}

export { HttpStore };
