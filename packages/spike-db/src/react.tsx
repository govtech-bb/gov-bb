/**
 * The React surface. Every live query in the spike is declared here, so no
 * component in either app contains SQL.
 *
 * This is also where the DocumentStore abstraction shows its one seam: a
 * live query is not a method on the interface, because "tell me when this
 * changes" has no natural shape that both PGlite and an HTTP driver
 * implement. An `ApiStore` would back these same hook signatures with
 * polling or SSE. Noted in the findings.
 */

import {
  PGliteProvider,
  useLiveQuery,
  usePGlite,
} from "@electric-sql/pglite-react";
import type { CollectionDefinition, PageDocument } from "@govtech-bb/block-kit";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { SpikeDb } from "./client";
import { PgliteStore, type DocumentSummary } from "./store";

const StoreContext = createContext<PgliteStore | null>(null);

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
      <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
    </PGliteProvider>
  );
}

/** The write path. Reads that must be live go through the hooks below. */
export function useStore(): PgliteStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <SpikeDbProvider>");
  return store;
}

export function useDb() {
  return usePGlite();
}

export function useDocumentList(): DocumentSummary[] | undefined {
  const result = useLiveQuery<DocumentSummary>(
    `select id::text as id, url, title, schema_name,
            updated_at::text as updated_at
       from content_pages order by url`,
    [],
  );
  return result?.rows;
}

const SELECT_DOC = `
  select 1 as version, id::text as id, url, slug, schema_name, document_type,
         title, description, is_draft, body, updated_at::text as updated_at
    from content_pages
`;

export function useDocument(
  id: string | null,
): PageDocument | null | undefined {
  const result = useLiveQuery<PageDocument>(
    `${SELECT_DOC} where id = $1::uuid`,
    [id ?? "00000000-0000-0000-0000-000000000000"],
  );
  return result ? (result.rows[0] ?? null) : undefined;
}

export function useDocumentByUrl(url: string): PageDocument | null | undefined {
  const result = useLiveQuery<PageDocument>(`${SELECT_DOC} where url = $1`, [
    url,
  ]);
  return result ? (result.rows[0] ?? null) : undefined;
}

export function useCollections(): CollectionDefinition[] | undefined {
  const result = useLiveQuery<CollectionDefinition>(
    `select key, title, record_key, schema from data_collections order by key`,
    [],
  );
  return result?.rows;
}

/**
 * Records for one collection, as the renderer's `data` map wants them.
 * Live, so adding a holiday rule shows up in the calendar without a reload.
 */
export function useCollectionRecords(
  collectionKey: string | null,
): Array<Record<string, unknown>> | undefined {
  const result = useLiveQuery<{ data: Record<string, unknown> }>(
    `select data from collection_records
      where collection_key = $1 and status = 'published'
      order by record_key`,
    [collectionKey ?? ""],
  );
  return result?.rows.map((row) => row.data);
}

/** Every collection a document's blocks reference, keyed for the renderer. */
export interface RenderData {
  data: Record<string, Array<Record<string, unknown>>>;
  /** True until every collection the document references has arrived. */
  loading: boolean;
}

export function useRenderData(
  doc: PageDocument | null | undefined,
): RenderData {
  const keys = useMemo(() => {
    if (!doc) return [];
    const found = new Set<string>();
    for (const block of doc.body.blocks) {
      if (block.type === "finder") {
        found.add(block.collection);
        for (const facet of block.facets) {
          if (facet.allowed_values_from) found.add(facet.allowed_values_from);
        }
      }
      if (block.type === "calendar") found.add(block.collection);
    }
    for (const ref of Object.values(doc.body.refs)) {
      if (ref.kind === "record" || ref.kind === "query")
        found.add(ref.collection);
    }
    return [...found].sort();
  }, [doc]);

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
}

export { useLiveQuery };
