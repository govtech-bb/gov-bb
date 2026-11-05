import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

// The data collections a page reads (#3183): the host reads a collection's records, and the page's contact blocks and
// facts share each read.

/** A collection and its records, as api_v2's public `GET /collections/:key/records` answers. */
export type CollectionRecords = {
  collection: {
    key: string;
    title: string;
    record_key: string;
    schema: { fields: readonly { key: string; label: string }[] };
  };
  records: readonly { record_key: string; data: Readonly<Record<string, string>> }[];
};

/** What the host lets a page's contact blocks and facts read and open; without a host, they show which record they name. */
export type PageCollections = {
  /** The collection, or null when there is no such collection. */
  read: (key: string) => Promise<CollectionRecords | null>;
  /** The collections a page can read, for choosing one; without it, only the one already chosen is offered. */
  list?: () => Promise<readonly { key: string; title: string }[]>;
  /** Opens the record's editing, such as the collection's screen. */
  openRecord?: (collection: string, record: string) => void;
};

type CollectionState =
  | { status: "unavailable" | "loading" | "failed" }
  | { status: "read"; value: CollectionRecords | null };

/**
 * The page's latest read of each collection. Every block and Block options showing a collection share it, so a read
 * made as the options open, which may find a record added since, updates the blocks too.
 */
function collectionStore(host: PageCollections) {
  const states = new Map<string, CollectionState>();
  const latest = new Map<string, number>();
  const listeners = new Set<() => void>();
  let reads = 0;

  return {
    host,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    get: (key: string) => states.get(key),
    read(key: string) {
      const read = ++reads;
      latest.set(key, read);

      const settle = (state: CollectionState) => {
        // An earlier read answering late never replaces a later one
        if (latest.get(key) !== read) return;
        states.set(key, state);
        listeners.forEach((listener) => listener());
      };

      host.read(key).then(
        (value) => settle({ status: "read", value }),
        () => settle({ status: "failed" }),
      );
    },
  };
}

const PageCollectionsContext = createContext<ReturnType<typeof collectionStore> | null>(null);

export function PageCollectionsProvider({
  collections,
  children,
}: {
  collections: PageCollections;
  children: ReactNode;
}) {
  const store = useMemo(() => collectionStore(collections), [collections]);

  return <PageCollectionsContext value={store}>{children}</PageCollectionsContext>;
}

export const usePageCollections = () => useContext(PageCollectionsContext)?.host ?? null;

const NO_STORE = () => () => {};

/** A collection as the host last read it, read again whenever a block, fact or picker showing it appears. */
export function useCollection(key: string): CollectionState {
  const store = useContext(PageCollectionsContext);

  const state = useSyncExternalStore(store?.subscribe ?? NO_STORE, () =>
    key ? store?.get(key) : undefined,
  );

  useEffect(() => {
    if (store && key) store.read(key);
  }, [store, key]);

  if (!store || !key) return { status: "unavailable" };

  return state ?? { status: "loading" };
}

/** The record a block or fact names, from a read collection; undefined when it has gone. */
export const findRecord = (collection: CollectionRecords, record: string) =>
  collection.records.find((row) => row.record_key === record);
