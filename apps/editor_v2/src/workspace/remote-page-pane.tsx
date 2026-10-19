import { ClockCounterClockwise } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ApiPage, EditorApi, TaxonomyCategory } from "../api/client";
import { pageToMarkdown, pickerCategories, pageFieldLabel } from "../api/page-markdown";
import { PRELOAD_FRESH, pageQuery, servicesQuery, taxonomyQuery } from "../api/queries";
import { PageDraftEditor } from "../host/page-editor";
import { download } from "../host/source-ui";
import { readPageMetadata } from "../pages";
import { DraftStore } from "../persistence/draft-store";
import { govbbPageCodec } from "../presets/govbb-page";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import type { SaveStateProps } from "../ui/save-state";
import { toast } from "../ui/toast";
import { PageHistoryDialog } from "./page-history-dialog";
import { EditorSessionProvider } from "../editor/react/composer";
import type { DocumentSessions } from "./document-views";
import { savePageDraft, type PageSession, type ServerPageBaseline } from "./page-sync";

type SessionListener = (id: string, session: PageSession | undefined) => void;

/** An API page opens directly into an in-memory editor, never through browser storage. */
export function RemotePagePane({
  api,
  id,
  active,
  onSession,
  sessions,
}: {
  api: EditorApi;
  id: string;
  active: boolean;
  onSession: SessionListener;
  sessions?: DocumentSessions;
}) {
  const opened = useRef(false);
  const page = useQuery({ ...pageQuery(api, id), staleTime: PRELOAD_FRESH });
  const taxonomy = useQuery(taxonomyQuery(api));

  if (!opened.current && (page.isError || taxonomy.isError))
    return active ? (
      <EmptyState
        kind="failed"
        size="page"
        title="We could not load this page"
        description="Check you are still signed in, then try again."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void page.refetch();
              void taxonomy.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    ) : null;

  if (!page.data || !taxonomy.data || (!opened.current && page.isFetching && page.isStale))
    return active ? <LoadingState size="page" label="Loading page…" /> : null;

  opened.current = true;

  const editor = (
    <RemotePageEditor
      key={id}
      api={api}
      page={page.data}
      categories={taxonomy.data}
      active={active}
      onSession={onSession}
    />
  );

  if (!sessions) return editor;
  sessions.open(id, page.data.updated_at);

  return <EditorSessionProvider session={sessions.get(id)}>{editor}</EditorSessionProvider>;
}

function RemotePageEditor({
  api,
  page: server,
  categories,
  active,
  onSession,
}: {
  api: EditorApi;
  page: ApiPage;
  categories: readonly TaxonomyCategory[];
  active: boolean;
  onSession: SessionListener;
}) {
  const [base, setBase] = useState<ServerPageBaseline>(() => ({
    page: server,
    markdown: pageToMarkdown(server, categories),
  }));

  const [store] = useState(() => new DraftStore(base.markdown, govbbPageCodec));
  const baseline = useRef(base);
  const saving = useRef(false);

  const rebase = (next: ServerPageBaseline) => {
    baseline.current = next;
    setBase(next);
  };

  const client = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Links find the site's services by name; the content API lists their entry pages
  const services = useQuery(servicesQuery(api)).data;

  const linkPages = useMemo(
    () => services?.map((service) => ({ title: service.title, url: service.url })),
    [services],
  );

  const [historyOpen, setHistoryOpen] = useState(false);

  const save = useMutation({
    mutationFn: (current: { base: ServerPageBaseline; markdown: string }) =>
      savePageDraft(api, current.base, current.markdown, categories),
    onSuccess: (outcome) => {
      if (outcome.kind === "saved") {
        rebase(outcome.base);
        client.setQueryData(pageQuery(api, server.id).queryKey, outcome.base.page);
        void client.invalidateQueries({ queryKey: ["content"] });
      } else if (outcome.kind === "conflict")
        void client.invalidateQueries({ queryKey: pageQuery(api, server.id).queryKey });
    },
    onSettled: () => {
      saving.current = false;
    },
  });

  const session = useMemo<PageSession>(
    () => ({
      store,
      getBaseline: () => baseline.current,
      isSaving: () => saving.current,
    }),
    [store, base, save.isPending],
  );

  useEffect(() => {
    onSession(server.id, session);

    return () => onSession(server.id, undefined);
  }, [onSession, server.id, session]);

  const visibility = useMemo(
    () => readPageMetadata(draft.committed).visibility || "public",
    [draft.committed],
  );

  const outcome = save.isPending ? undefined : save.data;
  const unsaved = draft.committed !== base.markdown;
  const stale = server.updated_at !== base.page.updated_at;

  const blocked = !draft.valid || draft.dirty || draft.status === "error";

  const errors = outcome?.kind === "invalid" ? outcome.errors : [];

  const saveDraft = () => {
    const snapshot = store.getSnapshot();

    if (saving.current || stale || !snapshot.valid || snapshot.dirty || snapshot.status === "error")
      return;
    saving.current = true;
    save.mutate({ base: baseline.current, markdown: snapshot.committed });
  };

  const loadSaved = () => {
    const markdown = pageToMarkdown(server, categories);
    store.edit(markdown);

    if (store.apply()) rebase({ page: server, markdown });
  };

  const newerVersion = "A newer version of this page has been saved since you opened it.";
  const downloadMine = () => download(store.getSnapshot().source, "page.md");

  // Source errors take precedence over the server's save state (useDraftSave).
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

    if (unsaved && (outcome?.kind === "failed" || save.isError))
      return {
        status: "failed",
        error:
          "We could not save this page. Keep this editor open to retry, or download your changes.",
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
              disabled={save.isPending}
              onClick={() => rebase({ page: server, markdown: pageToMarkdown(server, categories) })}
            >
              Keep my version
            </Button>
          )}
          <Button variant="secondary" disabled={blocked || save.isPending} onClick={loadSaved}>
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
      Your session has ended. Download your changes before signing in again; unsaved work will be
      lost when you leave.
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
        notice={notice}
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
          canRestore={!blocked && !save.isPending}
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
