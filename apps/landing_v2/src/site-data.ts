/**
 * Reading the estate, from wherever the route loader happens to be running.
 *
 * TanStack Start runs a loader on the server for the first request and in the
 * browser for subsequent navigations, and this module is the same code in
 * both places. That is the point of the change: the page's data is resolved
 * *before* anything renders, so `RenderDocument` receives `{doc, data}` as
 * props and there is no state in which a component has been mounted but has
 * nothing to show. The loading state is not hidden, it no longer exists.
 *
 * `API_URL` has to be absolute, because a server-side `fetch` has no origin
 * to resolve a relative path against.
 */

import type { PageDocument } from "@govtech-bb/block-kit/document";
import { collectionsFor } from "@govtech-bb/spike-db/collections";

const API_URL =
  // Set at build time for the browser bundle; readable at runtime on the
  // server, where a deploy supplies it per environment.
  (import.meta.env?.VITE_API_URL as string | undefined) ??
  process.env.API_URL ??
  "http://localhost:3020";

export interface DocumentSummary {
  id: string;
  url: string;
  title: string;
  schema_name: string;
  document_type: string;
  updated_at: string;
}

async function get<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) return null;
  return (await response.json()) as T;
}

/** Every published page, for the index. */
export async function listPages(): Promise<DocumentSummary[]> {
  return (await get<DocumentSummary[]>("/pages")) ?? [];
}

/**
 * A page and everything its blocks read, in one go.
 *
 * The collections are fetched in parallel and only the ones this page
 * actually references — a prose page fetches nothing beyond itself, and the
 * pharmacy finder fetches its 163 records before a byte of HTML is written.
 */
export async function loadPage(url: string): Promise<{
  doc: PageDocument | null;
  data: Record<string, Array<Record<string, unknown>>>;
}> {
  const doc = await get<PageDocument>(
    `/pages/by-url?url=${encodeURIComponent(url)}`,
  );
  if (!doc) return { doc: null, data: {} };

  const keys = collectionsFor(doc);
  const entries = await Promise.all(
    keys.map(
      async (key) =>
        [
          key,
          (await get<Array<Record<string, unknown>>>(
            `/collections/${encodeURIComponent(key)}/records`,
          )) ?? [],
        ] as const,
    ),
  );

  return { doc, data: Object.fromEntries(entries) };
}
