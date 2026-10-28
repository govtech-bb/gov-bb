import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ApiFailure, type ApiPage, type EditorApi, type SavedCategory } from "../api/client";
import { pageToMarkdown, pickerCategories, pageFieldLabel } from "../api/page-markdown";
import {
  PRELOAD_FRESH,
  pageQuery,
  savedCategoriesQuery,
  serviceQuery,
  servicesQuery,
} from "../api/queries";
import { PageDraftEditor } from "../host/page-editor";
import { download } from "../host/source-ui";
import { readPageMetadata } from "../pages";
import { DraftStore } from "../persistence/draft-store";
import { govbbPageCodec } from "../presets/govbb-page";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import type { SaveStateProps } from "../ui/save-state";
import { toast } from "../ui/toast";
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
  const categories = useQuery(savedCategoriesQuery(api));

  if (!opened.current && (page.isError || categories.isError))
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
              void categories.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    ) : null;

  if (!page.data || !categories.data || (!opened.current && page.isFetching && page.isStale))
    return active ? <LoadingState size="page" label="Loading page…" /> : null;

  opened.current = true;

  const editor = (
    <RemotePageEditor
      key={id}
      api={api}
      page={page.data}
      categories={categories.data}
      active={active}
      onSession={onSession}
      readError={page.error ?? categories.error}
      reading={page.isFetching || categories.isFetching}
      retryRead={() => {
        void page.refetch();
        void categories.refetch();
      }}
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
  readError,
  reading,
  retryRead,
}: {
  api: EditorApi;
  page: ApiPage;
  categories: readonly SavedCategory[];
  active: boolean;
  onSession: SessionListener;
  readError: Error | null;
  reading: boolean;
  retryRead: () => void;
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
  const href = useRouterState({ select: (state) => state.location.href });
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Links find the site's services by name; the content API lists their entry pages
  const services = useQuery(servicesQuery(api)).data;

  const service = services?.find(
    (item) => server.id === item.id || server.url.startsWith(`${item.url}/`),
  );

  const servicePages = useQuery({
    ...serviceQuery(api, service?.id ?? ""),
    enabled: !!service,
  }).data;

  const previewContext = useMemo(() => {
    const path = readPageMetadata(draft.committed).url ?? server.url;
    const breadcrumbs = [{ label: "Home", href: "/" }];
    const parts = path.split("/").filter(Boolean);

    for (let index = 1; index < parts.length; index++) {
      const href = `/${parts.slice(0, index).join("/")}`;
      const category = categories.find((item) => item.url === href);
      const page = servicePages?.pages.find((item) => item.url === href);

      const label =
        category?.title ??
        page?.title ??
        (href === service?.url
          ? service.title
          : href === `/${service?.category.slug}`
            ? service?.category.title
            : undefined);

      if (label) breadcrumbs.push({ label, href });
    }

    return { breadcrumbs, publishedAt: server.published_at };
  }, [draft.committed, server.url, server.published_at, categories, service, servicePages]);

  const linkPages = useMemo(
    () => services?.map((service) => ({ title: service.title, url: service.url })),
    [services],
  );

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
    else {
      // Discard the rejected source so the existing working copy remains editable.
      store.discard();
      toast("The saved version couldn't be opened", {
        tone: "error",
        description: "Your open copy is unchanged.",
      });
    }
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

  const signInAction = (
    <Button
      variant="secondary"
      onClick={() =>
        void navigate({
          to: "/auth",
          search: { state: "sign-in", returnTo: href, reason: "provider" },
        })
      }
    >
      Sign in again
    </Button>
  );

  const readStatus = readError instanceof ApiFailure ? readError.status : undefined;
  const readRefused = readStatus === 401 || readStatus === 403 || readStatus === 404;

  const readNotice = readError && (
    <Banner
      tone={readRefused ? "error" : "warning"}
      layout="strip"
      actions={
        <>
          {readStatus === 401 ? (
            signInAction
          ) : (
            <Button variant="secondary" pending={reading} onClick={retryRead}>
              {reading ? "Refreshing page…" : "Try again"}
            </Button>
          )}
          {readRefused && <Button onClick={downloadMine}>Download my version</Button>}
        </>
      }
    >
      {readStatus === 401
        ? "Your session has ended. Download your changes before signing in again."
        : readStatus === 403
          ? "You no longer have access to this page. Download a copy to keep your changes."
          : readStatus === 404
            ? "This page is no longer available. Download a copy to keep your changes."
            : "We could not refresh this page. Your open copy and unsaved changes are unchanged."}
    </Banner>
  );

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
    <Banner tone="warning" layout="strip" role="alert" actions={signInAction}>
      Your session has ended. Download your changes before signing in again; unsaved work will be
      lost when you leave.
    </Banner>
  ) : undefined;

  return (
    <PageDraftEditor
      store={store}
      active={active}
      server={standing()}
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
        readNotice ? (
          <>
            {readNotice}
            {notice}
          </>
        ) : (
          notice
        )
      }
      linkPages={linkPages}
      previewContext={previewContext}
      settings={{
        ...(server.parent_id === null && {
          categories: pickerCategories(categories),
          single: true,
        }),
        publishedAt: server.published_at,
        errors: Object.fromEntries(errors.map((error) => [error.field, error.message])),
      }}
    />
  );
}
