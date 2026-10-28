import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Category } from "../api/categories";
import { ApiFailure, type ApiPage, type EditorApi } from "../api/client";
import { PageEditLockToken, type PageEditLockGeneration } from "../api/page-schemas";
import { pageToMarkdown, pickerCategories, pageFieldLabel } from "../api/page-markdown";
import {
  PRELOAD_FRESH,
  categoriesQuery,
  pageQuery,
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
import {
  savePageChanges,
  pageHasUnsavedChanges,
  type PageSession,
  type PageEditBaseline,
} from "./page-sync";
import { PageEditLockSession, type IPageEditLockSession } from "./page-edit-lock-session";
import { PageEditLockNotice } from "./page-edit-lock-notice";

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
}): ReactNode {
  const opened = useRef(false);
  const page = useQuery({ ...pageQuery(api, id), staleTime: PRELOAD_FRESH });
  const categories = useQuery(categoriesQuery(api));

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
  sessions.open(id, String(page.data.version));

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
  categories: readonly Category[];
  active: boolean;
  onSession: SessionListener;
  readError: Error | null;
  reading: boolean;
  retryRead: () => void;
}) {
  const [base, setBase] = useState<PageEditBaseline>(() => ({
    page: server,
    markdown: pageToMarkdown(server, categories),
  }));

  const [store] = useState(() => new DraftStore(base.markdown, govbbPageCodec));
  const baseline = useRef(base);
  const saving = useRef(false);

  const editLock = useMemo<IPageEditLockSession>(
    () =>
      new PageEditLockSession(server.id, api, {
        nowMs: Date.now,
        schedule: (delayMs, task) => {
          const timer = window.setTimeout(task, delayMs);

          return () => window.clearTimeout(timer);
        },
        newToken: () => {
          const token = PageEditLockToken.parse(crypto.randomUUID());

          if (!token) throw new Error("Browser generated an invalid page edit lock credential");

          return token;
        },
      }),
    [api, server.id],
  );

  const lockState = useSyncExternalStore(editLock.subscribe, editLock.getSnapshot);

  useEffect(() => {
    if (!active) return;
    editLock.activate();

    const onVisibility = () => {
      if (document.visibilityState === "visible") editLock.reconcile();
    };

    document.addEventListener("visibilitychange", onVisibility);

    const onPageShow = () => {
      if (editLock.getSnapshot().kind === "inactive") editLock.activate();
      else editLock.reconcile();
    };

    window.addEventListener("pagehide", editLock.deactivate);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", editLock.reconcile);
    let previous = store.getSnapshot();

    const unsubscribe = store.subscribe(() => {
      const next = store.getSnapshot();

      if (
        next.source !== previous.source ||
        next.committed !== previous.committed ||
        next.recovery?.original !== previous.recovery?.original
      )
        editLock.recordActivity();
      previous = next;
    });

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", editLock.deactivate);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", editLock.reconcile);
      editLock.deactivate();
    };
  }, [active, editLock, store]);

  useEffect(() => {
    if (active && readError)
      editLock.markUnconfirmed({
        kind:
          readError instanceof ApiFailure && readError.status === 401
            ? "signed-out"
            : "unavailable",
      });
  }, [active, readError, editLock]);

  const rebase = (next: PageEditBaseline) => {
    baseline.current = next;
    setBase(next);
  };

  const client = useQueryClient();
  const refreshedLockGeneration = useRef<PageEditLockGeneration | undefined>(undefined);
  useEffect(() => {
    if (
      lockState.kind !== "editable" ||
      refreshedLockGeneration.current === lockState.status.lockGeneration
    )
      return;
    refreshedLockGeneration.current = lockState.status.lockGeneration;
    // A new acquisition can follow someone else's save; refresh the page, never the local baseline.
    void client.invalidateQueries({ queryKey: pageQuery(api, server.id).queryKey });
  }, [lockState, client, api, server.id]);
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
    mutationFn: (current: { base: PageEditBaseline; markdown: string; token: PageEditLockToken }) =>
      savePageChanges(api, current.base, current.markdown, categories, current.token),
    onSuccess: (outcome) => {
      if (outcome.kind === "saved") {
        rebase(outcome.base);
        client.setQueryData<ApiPage>(pageQuery(api, server.id).queryKey, (current) =>
          current && current.version > outcome.base.page.version ? current : outcome.base.page,
        );
        void client.invalidateQueries({ queryKey: ["content"] });
      } else if (outcome.kind === "conflict") {
        void client.invalidateQueries({ queryKey: pageQuery(api, server.id).queryKey });
      } else if (outcome.kind === "lock-lost") {
        editLock.markUnconfirmed({ kind: "lock-lost", pageId: server.id });
      } else if (
        outcome.kind === "outcome-unknown" ||
        outcome.kind === "signed-out" ||
        outcome.kind === "forbidden"
      ) {
        editLock.markUnconfirmed({ kind: outcome.kind });
      }
    },
    onSettled: () => {
      saving.current = false;
    },
  });

  const outcome = save.isPending ? undefined : save.data;
  const uncertainWrite = outcome?.kind === "outcome-unknown";
  const reviewWrite = useMutation({ mutationFn: () => api.page(server.id) });
  const reviewedPage = reviewWrite.data?.ok ? reviewWrite.data.value : undefined;

  const session = useMemo<PageSession>(
    () => ({
      store,
      getBaseline: () => baseline.current,
      getEditLockToken: () =>
        active && !readError && !uncertainWrite && outcome?.kind !== "missing"
          ? editLock.getEditLockToken()
          : undefined,
      isSaving: () => saving.current,
    }),
    [
      store,
      base,
      save.isPending,
      active,
      readError,
      uncertainWrite,
      outcome?.kind,
      editLock,
      lockState,
    ],
  );

  useEffect(() => {
    onSession(server.id, session);

    return () => onSession(server.id, undefined);
  }, [onSession, server.id, session]);

  const visibility = useMemo(
    () => readPageMetadata(draft.committed).visibility || "public",
    [draft.committed],
  );

  const unsaved = pageHasUnsavedChanges(session);
  const stale = server.version !== base.page.version;

  const blocked = !draft.valid || draft.dirty || draft.status === "error";

  const errors = outcome?.kind === "invalid" ? outcome.errors : [];

  const saveChanges = () => {
    const snapshot = store.getSnapshot();
    const editLockToken = session.getEditLockToken();

    if (
      !editLockToken ||
      saving.current ||
      stale ||
      !snapshot.valid ||
      snapshot.dirty ||
      snapshot.status === "error"
    )
      return;
    saving.current = true;
    reviewWrite.reset();
    save.mutate({ base: baseline.current, markdown: snapshot.committed, token: editLockToken });
  };

  const loadSaved = (page: ApiPage) => {
    const markdown = pageToMarkdown(page, categories);

    try {
      const token = store.captureReplacementToken();
      const result = store.replacePrepared(govbbPageCodec.prepare(markdown), token);

      if (result.status === "committed") {
        rebase({ page, markdown });
        save.reset();

        return;
      }
    } catch {
      // Preparation can reject unsupported saved content; do not first replace or discard local source.
    }

    toast("The saved version couldn't be opened", {
      tone: "error",
      description: "Your open copy is unchanged.",
    });
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

    if (uncertainWrite)
      return {
        status: "failed",
        error:
          "The server may have saved your changes. Check the saved version before deciding what to keep.",
        conflict,
        onDownload: downloadMine,
      };

    if (unsaved && (outcome?.kind === "failed" || save.isError))
      return {
        status: "failed",
        error:
          "We could not save this page. Keep this editor open to retry, or download your changes.",
        conflict,
        onRetry: saveChanges,
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
  const notice = uncertainWrite ? (
    <Banner
      tone="warning"
      layout="strip"
      title="Save outcome unknown"
      actions={
        <>
          <Button
            variant="secondary"
            pending={reviewWrite.isPending}
            onClick={() => {
              reviewWrite.mutate();
              editLock.reconcile();
            }}
          >
            Check saved version
          </Button>
          {reviewedPage && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  rebase({
                    page: reviewedPage,
                    markdown: pageToMarkdown(reviewedPage, categories),
                  });
                  save.reset();
                }}
              >
                Keep my working copy
              </Button>
              <Button
                variant="secondary"
                disabled={blocked}
                onClick={() => loadSaved(reviewedPage)}
              >
                Use saved version
              </Button>
            </>
          )}
          <Button onClick={downloadMine}>Download my version</Button>
        </>
      }
    >
      Your submitted snapshot and any newer edits are still here. Nothing will be resent
      automatically.
      {reviewWrite.data?.ok === false && (
        <p>
          We could not read the saved page. Keep this tab open and check again, or download your
          work.
        </p>
      )}
      {reviewedPage && (
        <details className="mt-2">
          <summary>Review saved version {reviewedPage.version}</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words">
            {pageToMarkdown(reviewedPage, categories)}
          </pre>
        </details>
      )}
    </Banner>
  ) : stale ? (
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
              onClick={() => {
                rebase({ page: server, markdown: pageToMarkdown(server, categories) });
                save.reset();
              }}
            >
              Keep my version
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={blocked || save.isPending}
            onClick={() => loadSaved(server)}
          >
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
  ) : outcome?.kind === "forbidden" ? (
    <Banner tone="warning" layout="strip">
      You no longer have permission to save this page. Your open working copy is unchanged.
    </Banner>
  ) : undefined;

  const recovery = draft.recovery;

  const recoveryActions = (
    <>
      <Button onClick={downloadMine}>Download source</Button>
      {draft.source !== draft.committed && (
        <Button onClick={() => download(draft.committed, "applied-page.md")}>
          Download applied Markdown
        </Button>
      )}
      {recovery && (
        <Button
          onClick={() =>
            download(
              recovery.original,
              recovery.kind === "canvas" ? "editor-state.json" : "original-source.md",
            )
          }
        >
          Download recovery state
        </Button>
      )}
    </>
  );

  return (
    <PageDraftEditor
      store={store}
      active={active}
      readOnly={!session.getEditLockToken()}
      server={standing()}
      publish={
        <Button
          variant="accent"
          disabled={!session.getEditLockToken() || !unsaved || stale || blocked || save.isPending}
          onClick={saveChanges}
        >
          {visibility === "public" ? "Publish changes" : "Save"}
        </Button>
      }
      notice={
        <>
          {active && (
            <PageEditLockNotice
              session={editLock}
              state={lockState}
              signIn={signInAction}
              recovery={recoveryActions}
            />
          )}
          {readNotice}
          {notice}
          {draft.recovery && (
            <Banner layout="strip" tone="warning" actions={recoveryActions}>
              The full recovery input is still in this tab. Download it before leaving.
            </Banner>
          )}
        </>
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
