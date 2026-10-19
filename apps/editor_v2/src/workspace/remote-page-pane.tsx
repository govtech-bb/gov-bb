import { ClockCounterClockwise } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ApiPage, EditorApi } from "../api/client";
import { pageToMarkdown, pickerCategories, pageFieldLabel } from "../api/page-markdown";
import { PRELOAD_FRESH, pageQuery, servicesQuery, taxonomyQuery } from "../api/queries";
import { browserDraftStorage } from "../host/govbb-draft";
import { PageDraftEditor } from "../host/page-editor";
import { download } from "../host/source-ui";
import { readPageMetadata } from "../pages";
import type { DraftStore } from "../persistence/draft-store";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import type { SaveStateProps } from "../ui/save-state";
import { toast } from "../ui/toast";
import { PageHistoryDialog } from "./page-history-dialog";
import {
  parseServerPageBaseline,
  savePageDraft,
  seedPageDraftFromServer,
  serverPageBaselineKey,
  writeServerPageBaseline,
  type ServerPageBaseline,
} from "./page-sync";
import { pageDocumentFromApi, inferServicePageRole } from "./service-pages";
import { openDocument } from "./documents";
import { flushDocument } from "./model";

const baseListeners = new Set<() => void>();

/** Tell this tab's readers that a server copy changed; other tabs hear the storage event. */
export function notifyServerPageBaseline() {
  for (const listener of baseListeners) listener();
}

function subscribeServerPageBaseline(listener: () => void) {
  baseListeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    baseListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The server copy of a page this browser holds, current across tabs. */
export function useServerPageBaseline(id: string) {
  const source = useSyncExternalStore(subscribeServerPageBaseline, () =>
    window.localStorage.getItem(serverPageBaselineKey(id)),
  );

  return useMemo(() => parseServerPageBaseline(source, id), [source, id]);
}

/** Told which draft a page's editor holds once it opens, and told again when the editor closes. */
type StoreListener = (id: string, store: DraftStore | undefined) => void;

/** A page from the content API, placed in its browser draft before the editor opens it. */
export function RemotePagePane({
  api,
  id,
  active,
  onStore,
}: {
  api: EditorApi;
  id: string;
  active: boolean;
  onStore: StoreListener;
}) {
  const client = useQueryClient();

  // Seeding writes the draft before its store first reads it, once per page per session.
  const opened = useQuery({
    queryKey: ["opened", id],
    queryFn: async () => {
      const [page, categories] = await Promise.all([
        // A page preloaded just now, as its link was pointed at, opens without asking again
        client.fetchQuery({ ...pageQuery(api, id), staleTime: PRELOAD_FRESH }),
        client.ensureQueryData(taxonomyQuery(api)),
      ]);

      seedPageDraftFromServer(browserDraftStorage, page, categories);
      notifyServerPageBaseline();

      return page;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (opened.isPending) return active ? <LoadingState size="page" label="Loading page…" /> : null;

  if (opened.isError)
    return active ? (
      <EmptyState
        kind="failed"
        size="page"
        title="We could not load this page"
        description="Check you are still signed in, then try again."
        actions={
          <Button variant="secondary" onClick={() => void opened.refetch()}>
            Try again
          </Button>
        }
      />
    ) : null;

  return <RemotePageEditor api={api} page={opened.data} active={active} onStore={onStore} />;
}

function RemotePageEditor({
  api,
  page,
  active,
  onStore,
}: {
  api: EditorApi;
  page: ApiPage;
  active: boolean;
  onStore: StoreListener;
}) {
  const [store] = useState(() =>
    openDocument(
      pageDocumentFromApi({ ...page, role: inferServicePageRole(page) }),
      browserDraftStorage,
    ),
  );

  useEffect(() => {
    onStore(page.id, store);

    return () => onStore(page.id, undefined);
  }, [onStore, page.id, store]);

  const client = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const base = useServerPageBaseline(page.id);
  const categories = useQuery(taxonomyQuery(api)).data ?? [];
  const server = useQuery(pageQuery(api, page.id)).data ?? page;
  // Links find the site's services by name; the content API lists their entry pages
  const services = useQuery(servicesQuery(api)).data;

  const linkPages = useMemo(
    () => services?.map((service) => ({ title: service.title, url: service.url })),
    [services],
  );

  const [failure, setFailure] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const save = useMutation({
    mutationFn: (current: { base: ServerPageBaseline; markdown: string }) =>
      savePageDraft(api, current.base, current.markdown, categories),
    onSuccess: (outcome) => {
      if (outcome.kind === "saved") {
        rebase(outcome.base);
        client.setQueryData(pageQuery(api, page.id).queryKey, outcome.base.page);
        void client.invalidateQueries({ queryKey: ["content"] });
      } else if (outcome.kind === "conflict")
        void client.invalidateQueries({ queryKey: pageQuery(api, page.id).queryKey });
    },
  });

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

  const visibility = useMemo(
    () => readPageMetadata(draft.committed).visibility || "public",
    [draft.committed],
  );

  const outcome = save.isPending ? undefined : save.data;
  const unsaved = !!base && draft.committed !== base.markdown;
  const stale = !!base && server.updated_at !== base.page.updated_at;

  const blocked =
    !draft.valid ||
    draft.dirty ||
    !!draft.conflict ||
    !!draft.replacement ||
    !!draft.recovery ||
    draft.status === "error";

  const errors = outcome?.kind === "invalid" ? outcome.errors : [];

  const rebase = (next: ServerPageBaseline) => {
    writeServerPageBaseline(browserDraftStorage, next);
    notifyServerPageBaseline();
  };

  const saveDraft = () => {
    store.flush();
    const snapshot = store.getSnapshot();

    if (base && snapshot.status !== "error") save.mutate({ base, markdown: snapshot.committed });
  };

  const loadSaved = () => {
    const markdown = pageToMarkdown(server, categories);
    store.edit(markdown);

    if (store.apply()) rebase({ page: server, markdown });
  };

  const newerVersion = "A newer version of this page has been saved since you opened it.";
  const downloadMine = () => download(draft.committed, "page.md");

  // Where the page stands in the content API, read out by its save state. A problem with its browser copy outranks
  // this, as the one to fix first (useDraftSave)
  const standing = (): SaveStateProps => {
    const conflict = stale ? newerVersion : undefined;

    if (save.isPending) return { status: "saving", conflict };

    if (outcome?.kind === "missing")
      return {
        status: "failed",
        error:
          "This page has been deleted, so your changes can't be saved. Download a copy to keep them.",
        conflict,
        onDownload: downloadMine,
      };

    if (unsaved && outcome?.kind === "failed")
      return {
        status: "failed",
        error: "We could not save this page. Your changes are kept in this browser.",
        conflict,
        onRetry: saveDraft,
        onDownload: downloadMine,
      };

    const live = visibility === "public";

    return {
      status: unsaved ? (live ? "unpublished" : "unsaved") : live ? "published" : "saved",
      conflict,
    };
  };

  // The save state reads out the newer version, so its notice doesn't too
  const notice = stale ? (
    <Banner
      tone="warning"
      layout="strip"
      role="none"
      actions={
        <>
          {unsaved && (
            <Button
              variant="secondary"
              onClick={() => rebase({ page: server, markdown: pageToMarkdown(server, categories) })}
            >
              Keep my version
            </Button>
          )}
          <Button variant="secondary" disabled={blocked} onClick={loadSaved}>
            Load saved version
          </Button>
          {unsaved && <Button onClick={downloadMine}>Download my version</Button>}
        </>
      }
    >
      {newerVersion}
    </Banner>
  ) : outcome?.kind === "invalid" ? (
    <Banner tone="error" layout="strip" title="There is a problem">
      <ul className="mt-1 list-disc ps-5">
        {errors.map((error) => (
          <li key={`${error.field}:${error.message}`}>
            {pageFieldLabel(error.field)}: {error.message}
          </li>
        ))}
      </ul>
    </Banner>
  ) : outcome?.kind === "signed-out" ? (
    <Banner
      tone="warning"
      layout="strip"
      role="alert"
      actions={
        <Button
          variant="secondary"
          onClick={() =>
            void navigate({
              to: "/auth",
              search: { state: "sign-in", returnTo: pathname, reason: "provider" },
            })
          }
        >
          Sign in again
        </Button>
      }
    >
      Your session has ended. Sign in again to save; your changes are kept in this browser.
    </Banner>
  ) : undefined;

  return (
    <>
      <PageDraftEditor
        store={store}
        active={active}
        server={standing()}
        versions={
          <Bar.Tool
            icon={<ClockCounterClockwise />}
            label="History"
            onClick={() => setHistoryOpen(true)}
          />
        }
        publish={
          <Button
            variant="accent"
            disabled={!unsaved || stale || blocked || save.isPending || outcome?.kind === "missing"}
            onClick={saveDraft}
          >
            {visibility === "public" ? "Publish changes" : "Save"}
          </Button>
        }
        notice={
          <>
            {/* Leaving was stopped, as the page's browser copy isn't safe yet */}
            {failure && (
              <Banner tone="error" layout="strip">
                {failure}
              </Banner>
            )}
            {notice}
          </>
        }
        linkPages={linkPages}
        settings={{
          ...(server.parent_id === null && {
            categories: pickerCategories(categories),
            single: true,
          }),
          publishedAt: server.published_at,
          errors: Object.fromEntries(errors.map((error) => [error.field, error.message])),
        }}
      />
      {historyOpen && (
        <PageHistoryDialog
          api={api}
          current={server}
          categories={categories}
          canRestore={!blocked}
          close={() => setHistoryOpen(false)}
          restore={(markdown) => {
            store.edit(markdown);

            // The dialog closes on the restored page, which isn't saved yet
            if (store.apply())
              toast("Version restored", {
                tone: "info",
                description:
                  visibility === "public" ? "Publish changes to make it live." : "Save to keep it.",
              });
            setHistoryOpen(false);
          }}
        />
      )}
    </>
  );
}
