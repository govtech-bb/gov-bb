import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { ApiPage, EditorApi } from "../api/client";
import { pickerCategories } from "../api/page-markdown";
import { pageQuery, taxonomyQuery } from "../api/queries";
import { browserDraftStorage } from "../host/govbb-draft";
import { PageDraftEditor } from "../host/page-editor";
import { Button } from "../ui/button";
import { apiPageDocument, parseServerBase, roleOf, seedApiPage, serverBaseKey } from "./api-pages";
import { openDocument } from "./documents";
import { flushDocument } from "./model";

const baseListeners = new Set<() => void>();

/** Tell this tab's readers that a server copy changed; other tabs hear the storage event. */
export function notifyServerBase() {
  for (const listener of baseListeners) listener();
}

function subscribeServerBase(listener: () => void) {
  baseListeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    baseListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The server copy of a page this browser holds, current across tabs. */
export function useServerBase(id: string) {
  const source = useSyncExternalStore(subscribeServerBase, () =>
    window.localStorage.getItem(serverBaseKey(id)),
  );

  return useMemo(() => parseServerBase(source, id), [source, id]);
}

/** A page from the content API, placed in its browser draft before the editor opens it. */
export function ApiPagePane({ api, id, active }: { api: EditorApi; id: string; active: boolean }) {
  const client = useQueryClient();

  // Seeding writes the draft before its store first reads it, once per page per session.
  const opened = useQuery({
    queryKey: ["opened", id],
    queryFn: async () => {
      const [page, categories] = await Promise.all([
        client.fetchQuery(pageQuery(api, id)),
        client.ensureQueryData(taxonomyQuery(api)),
      ]);

      seedApiPage(browserDraftStorage, page, categories);
      notifyServerBase();

      return page;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (opened.isPending)
    return active ? (
      <p role="status" className="p-8 text-muted">
        Loading page…
      </p>
    ) : null;

  if (opened.isError)
    return active ? (
      <section className="p-8">
        <p role="alert" className="mb-4">
          We could not load this page. Check you are still signed in, then try again.
        </p>
        <Button variant="secondary" onClick={() => void opened.refetch()}>
          Try again
        </Button>
      </section>
    ) : null;

  return <ApiPageEditor api={api} page={opened.data} active={active} />;
}

function ApiPageEditor({ api, page, active }: { api: EditorApi; page: ApiPage; active: boolean }) {
  const [store] = useState(() =>
    openDocument(apiPageDocument({ ...page, role: roleOf(page) }), browserDraftStorage),
  );

  const taxonomy = useQuery(taxonomyQuery(api));
  const server = useQuery(pageQuery(api, page.id)).data ?? page;
  const [failure, setFailure] = useState("");

  useBlocker({
    disabled: !active,
    enableBeforeUnload: () => {
      try {
        flushDocument(store);

        return false;
      } catch {
        return true;
      }
    },
    shouldBlockFn: () => {
      try {
        flushDocument(store);
        setFailure("");

        return false;
      } catch (error) {
        setFailure(
          error instanceof Error ? error.message : "Save or download this draft before leaving it.",
        );

        return true;
      }
    },
  });

  return (
    <>
      {failure && (
        <div role="alert" className="border-s-4 border-error bg-white px-6 py-3 text-error">
          {failure}
        </div>
      )}
      <PageDraftEditor
        store={store}
        active={active}
        details={
          server.parent_id === null
            ? {
                categories: pickerCategories(taxonomy.data ?? []),
                single: true,
                publishedAt: server.published_at,
              }
            : { publishedAt: server.published_at }
        }
      />
    </>
  );
}
