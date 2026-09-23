/**
 * The seam between the two backends.
 *
 * `useLiveQuery` is a hook and needs a PGlite instance, so "use PGlite or use
 * HTTP" cannot be decided inside a hook — by then the hook has already been
 * called. It has to be decided above them, which is what this does: each
 * backend supplies an object of hook implementations, the provider puts it in
 * context, and the public hooks delegate.
 *
 * The implementation object is created once per provider and never swapped,
 * so hook order is stable across renders — the property that the rules of
 * hooks actually protect. A component importing `useDocumentByUrl` cannot
 * tell which backend answered it, which is the whole point.
 */

import type { CollectionDefinition, PageDocument } from "@govtech-bb/block-kit";
import { createContext, useContext } from "react";
import type { DocumentSummary } from "./store";

/** Every collection a document's blocks reference, keyed for the renderer. */
export interface RenderData {
  data: Record<string, Array<Record<string, unknown>>>;
  /** True until every collection the document references has arrived. */
  loading: boolean;
}

/**
 * The write path. Both stores satisfy this structurally — `PgliteStore` and
 * `HttpStore` share method names deliberately rather than by coincidence.
 */
export interface WritableStore {
  list(): Promise<DocumentSummary[]>;
  get(id: string): Promise<PageDocument | null>;
  getByUrl(url: string): Promise<PageDocument | null>;
  listCollections(): Promise<CollectionDefinition[]>;
  records(collectionKey: string): Promise<Array<Record<string, unknown>>>;
  recordRows(
    collectionKey: string,
  ): Promise<Array<{ record_key: string; data: Record<string, unknown> }>>;
  save(doc: PageDocument, ifUpdatedAt: string | null): Promise<PageDocument>;
  delete(id: string): Promise<void>;
  saveRecord(
    collectionKey: string,
    recordKey: string,
    data: Record<string, unknown>,
    previousKey?: string,
  ): Promise<void>;
  deleteRecord(collectionKey: string, recordKey: string): Promise<void>;
}

export interface Bindings {
  useStore(): WritableStore;
  /**
   * Drop, migrate and reseed — or `null` where that is not something this
   * backend will do. Against a browser-local database it is a convenience;
   * against a shared server it would wipe an estate for everyone from an
   * unauthenticated button, so the HTTP backend declines and the UI hides
   * the control rather than offering something that fails.
   */
  useReset(): (() => Promise<void>) | null;
  useDocumentList(): DocumentSummary[] | undefined;
  useDocument(id: string | null): PageDocument | null | undefined;
  useDocumentByUrl(url: string): PageDocument | null | undefined;
  useCollections(): CollectionDefinition[] | undefined;
  useCollectionRecords(
    collectionKey: string | null,
  ): Array<Record<string, unknown>> | undefined;
  useCollectionRows(
    collectionKey: string | null,
  ): Array<{ record_key: string; data: Record<string, unknown> }> | undefined;
  useRenderData(doc: PageDocument | null | undefined): RenderData;
}

export const BindingsContext = createContext<Bindings | null>(null);

function useBindings(): Bindings {
  const bindings = useContext(BindingsContext);
  if (!bindings) {
    throw new Error(
      "Data hooks must be used inside <SpikeDbProvider> or <ApiProvider>",
    );
  }
  return bindings;
}

/*
 * The public surface. Every one of these delegates, so adding a backend means
 * adding an implementation object rather than touching any component.
 */

export const useStore = (): WritableStore => useBindings().useStore();

export const useReset = () => useBindings().useReset();

export const useDocumentList = () => useBindings().useDocumentList();

export const useDocument = (id: string | null) =>
  useBindings().useDocument(id);

export const useDocumentByUrl = (url: string) =>
  useBindings().useDocumentByUrl(url);

export const useCollections = () => useBindings().useCollections();

export const useCollectionRecords = (collectionKey: string | null) =>
  useBindings().useCollectionRecords(collectionKey);

export const useCollectionRows = (collectionKey: string | null) =>
  useBindings().useCollectionRows(collectionKey);

export const useRenderData = (doc: PageDocument | null | undefined) =>
  useBindings().useRenderData(doc);

/**
 * Which collections a document needs, as a comma-joined signature.
 *
 * Shared by both backends because both need the same answer and both are
 * sensitive to getting it as a *value* rather than an identity: in the editor
 * the draft is a new object on every keystroke, and keying a subscription on
 * `doc` identity re-subscribed many times a second, which deadlocked PGlite's
 * single worker connection and made `save()` hang with nothing logged.
 */
export const SEPARATOR = ",";

export function collectionSignature(
  doc: PageDocument | null | undefined,
): string {
  if (!doc) return "";
  const found = new Set<string>();
  for (const block of doc.body.blocks) {
    if (block.type === "finder") {
      found.add(block.collection);
      for (const facet of block.facets) {
        if (facet.allowed_values_from) found.add(facet.allowed_values_from);
      }
    }
    if (block.type === "calendar") found.add(block.collection);
    // A contact block names its collection directly, like a finder and a
    // calendar. Before it did, it was reached through a `record` ref and
    // picked up by the loop below — so moving it off refs would have quietly
    // stopped its data loading and left every contact block claiming its
    // record was missing.
    if (block.type === "contact") found.add(block.collection);
  }
  for (const ref of Object.values(doc.body.refs)) {
    if (ref.kind === "record" || ref.kind === "query") found.add(ref.collection);
  }
  return [...found].sort().join(SEPARATOR);
}
