/**
 * The React surface. Every live query in the spike is declared here, so no
 * component in either app contains SQL.
 *
 * The hooks themselves now live in `bindings.tsx` and delegate to whichever
 * backend a provider supplied — PGlite here, HTTP in `http-react.tsx`. That
 * indirection exists because `useLiveQuery` needs a PGlite instance, so the
 * choice between backends cannot be made inside a hook; by then it has
 * already been called.
 */

import {
  PGliteProvider,
  useLiveQuery,
  usePGlite,
} from "@electric-sql/pglite-react";
import type { CollectionDefinition, PageDocument } from "@govtech-bb/block-kit";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  BindingsContext,
  collectionSignature,
  SEPARATOR,
  type Bindings,
  type RenderData,
} from "./bindings";
import type { SpikeDb } from "./client";
import { reset } from "./reset";
import { PgliteStore, type DocumentSummary } from "./store";

const StoreContext = createContext<PgliteStore | null>(null);

const SELECT_DOC = `
  select 1 as version, id::text as id, url, slug, schema_name, document_type,
         title, description, is_draft, body, updated_at::text as updated_at
    from content_pages
`;

function useLocalStore(): PgliteStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <SpikeDbProvider>");
  return store;
}

/*
 * Built once at module scope rather than per render: the object identity is
 * what keeps hook order stable across renders, and none of these close over
 * anything that changes.
 */
const pgliteBindings: Bindings = {
  useStore: useLocalStore,

  useReset: () => {
    const db = usePGlite();
    return useCallback(() => reset(db as unknown as SpikeDb), [db]);
  },

  useDocumentList: () =>
    useLiveQuery<DocumentSummary>(
      `select id::text as id, url, title, schema_name, document_type,
              updated_at::text as updated_at
         from content_pages order by url`,
      [],
    )?.rows,

  useDocument: (id) => {
    const result = useLiveQuery<PageDocument>(
      `${SELECT_DOC} where id = $1::uuid`,
      [id ?? "00000000-0000-0000-0000-000000000000"],
    );
    return result ? (result.rows[0] ?? null) : undefined;
  },

  useDocumentByUrl: (url) => {
    const result = useLiveQuery<PageDocument>(`${SELECT_DOC} where url = $1`, [
      url,
    ]);
    return result ? (result.rows[0] ?? null) : undefined;
  },

  useCollections: () =>
    useLiveQuery<CollectionDefinition>(
      `select key, title, record_key, schema from data_collections order by key`,
      [],
    )?.rows,

  useCollectionRecords: (collectionKey) =>
    useLiveQuery<{ data: Record<string, unknown> }>(
      `select data from collection_records
        where collection_key = $1 and status = 'published'
        order by record_key`,
      [collectionKey ?? ""],
    )?.rows.map((row) => row.data),

  useCollectionRows: (collectionKey) =>
    useLiveQuery<{
      record_key: string;
      data: Record<string, unknown>;
    }>(
      `select record_key, data from collection_records
        where collection_key = $1 and status = 'published'
        order by record_key`,
      [collectionKey ?? ""],
    )?.rows,

  useRenderData: (doc): RenderData => {
    // Memoised on the *contents* of the key set, not on `doc`'s identity.
    //
    // That distinction is load-bearing. On the site `doc` is stable, so either
    // would do. In the editor the draft is a new object on every keystroke, so
    // keying on identity handed `useLiveQuery` a fresh params array many times
    // a second; each one tears down and re-creates the subscription, and the
    // resulting churn deadlocks PGlite's single worker connection — the next
    // `save()` then never settles, with no error to show for it.
    const signature = useMemo(() => collectionSignature(doc), [doc]);
    const keys = useMemo(
      () => (signature === "" ? [] : signature.split(SEPARATOR)),
      [signature],
    );

    // A single query for every collection the page needs, so the hook count
    // stays fixed no matter how the document's blocks change.
    const result = useLiveQuery<{
      collection_key: string;
      data: Record<string, unknown>;
    }>(
      `select collection_key, data from collection_records
        where collection_key = any($1::text[]) and status = 'published'
        order by collection_key, record_key`,
      [keys],
    );

    return useMemo(() => {
      const grouped: Record<string, Array<Record<string, unknown>>> = {};
      for (const key of keys) grouped[key] = [];
      for (const row of result?.rows ?? []) {
        (grouped[row.collection_key] ??= []).push(row.data);
      }
      // Setting up a live query over the worker takes a beat. Without this
      // an island cannot tell "no records" from "records not here yet", and
      // renders its empty state at exactly the wrong moment.
      return { data: grouped, loading: keys.length > 0 && result === undefined };
    }, [keys, result]);
  },
};

export function SpikeDbProvider({
  db,
  children,
}: {
  db: SpikeDb;
  children: ReactNode;
}) {
  const store = useMemo(() => new PgliteStore(db), [db]);
  return (
    <PGliteProvider db={db as never}>
      <StoreContext.Provider value={store}>
        <BindingsContext.Provider value={pgliteBindings}>
          {children}
        </BindingsContext.Provider>
      </StoreContext.Provider>
    </PGliteProvider>
  );
}

export function useDb() {
  return usePGlite();
}

export { ApiProvider } from "./http-react";
export type { RenderData, WritableStore } from "./bindings";
export {
  useReset,
  useCollectionRecords,
  useCollectionRows,
  useCollections,
  useDocument,
  useDocumentByUrl,
  useDocumentList,
  useRenderData,
  useStore,
} from "./bindings";
export { useLiveQuery };
