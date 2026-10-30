import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Category } from "../api/categories";
import { ApiFailure, type ApiPage, type EditorApi } from "../api/client";
import { apiMessage } from "../api/failure-messages";
import {
  PageEditLockToken,
  pageContentVersionSchema,
  type PageContentVersion,
} from "../api/page-schemas";
import { pageToMarkdown, pickerCategories, pageFieldLabel } from "../api/page-markdown";
import {
  PRELOAD_FRESH,
  categoriesQuery,
  rolesQuery,
  pageQuery,
  serviceQuery,
  servicesQuery,
} from "../api/queries";
import { PageDraftEditor } from "../host/page-editor";
import { download } from "../host/source-ui";
import { readPageMetadata } from "../pages";
import { DraftStore } from "../persistence/draft-store";
import type { DraftSnapshot } from "../persistence/types";
import { govbbPageCodec } from "../presets/govbb-page";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { TextLink } from "../ui/text-link";
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
  nav,
}: {
  api: EditorApi;
  id: string;
  active: boolean;
  onSession: SessionListener;
  sessions?: DocumentSessions;
  /** What shows the service's pages while they're hidden: at the start of the page's bar. */
  nav?: ReactNode;
}): ReactNode {
  const opened = useRef(false);
  const page = useQuery({ ...pageQuery(api, id), staleTime: PRELOAD_FRESH });
  const categories = useQuery(categoriesQuery(api));

  if (!opened.current && (page.isError || categories.isError))
    return active ? (
      <>
        {nav && <Bar.Root>{nav}</Bar.Root>}
        <EmptyState
          tone="error"
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
      </>
    ) : null;

  if (!page.data || !categories.data || (!opened.current && page.isFetching && page.isStale))
    return active ? <LoadingState size="page" label="Loading page…" /> : null;

  opened.current = true;

  return (
    <RemotePageEditor
      key={id}
      api={api}
      page={page.data}
      categories={categories.data}
      active={active}
      onSession={onSession}
      sessions={sessions}
      nav={nav}
      readError={page.error ?? categories.error}
      reading={page.isFetching || categories.isFetching}
      retryRead={() => {
        void page.refetch();
        void categories.refetch();
      }}
    />
  );
}

function RemotePageEditor({
  api,
  page: server,
  categories,
  active,
  onSession,
  sessions,
  nav,
  readError,
  reading,
  retryRead,
}: {
  api: EditorApi;
  page: ApiPage;
  categories: readonly Category[];
  active: boolean;
  onSession: SessionListener;
  sessions?: DocumentSessions;
  nav?: ReactNode;
  readError: Error | null;
  reading: boolean;
  retryRead: () => void;
}) {
  const [base, setBase] = useState<PageEditBaseline>(() => ({
    page: server,
    markdown: pageToMarkdown(server, categories),
  }));

  const [workingCopy, setWorkingCopy] = useState(() => ({
    store: new DraftStore(base.markdown, govbbPageCodec),
    revision: 0,
  }));

  const { store } = workingCopy;
  const [loadedLockToken, setLoadedLockToken] = useState<PageEditLockToken>();
  const [reloadRequested, setReloadRequested] = useState(false);
  const reloadTrigger = useRef<HTMLButtonElement>(null);
  const editorElement = useRef<HTMLDivElement>(null);
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

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", editLock.deactivate);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", editLock.reconcile);
      editLock.deactivate();
    };
  }, [active, editLock]);

  useEffect(() => {
    if (!active) return;
    let previous = store.getSnapshot();

    return store.subscribe(() => {
      const next = store.getSnapshot();

      if (
        next.source !== previous.source ||
        next.committed !== previous.committed ||
        next.recovery?.original !== previous.recovery?.original
      )
        editLock.recordActivity();
      previous = next;
    });
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

  const client = useQueryClient();

  const accessRefused =
    lockState.kind === "lock-unconfirmed" && lockState.failure?.kind === "forbidden";

  // The lock routes refused access, not a save policy: read the roles again, so a lost editor role is known
  useEffect(() => {
    if (accessRefused) void client.invalidateQueries({ queryKey: ["me"] });
  }, [accessRefused, client]);

  // A banner button that goes once pressed (Reload page, Start editing) hands focus to the page, not to nowhere.
  const lastFocus = useRef<Element>(null);

  const pageFocus = () =>
    editorElement.current?.querySelector<HTMLElement>('[aria-label="Page title"]') ??
    editorElement.current!;

  useEffect(() => {
    const element = editorElement.current;

    if (!element) return;

    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Element) lastFocus.current = event.target;
    };

    // Left on purpose, its control still there: whatever happens to it later isn't the author's focus
    const onBlur = (event: FocusEvent) => {
      const left = event.target;

      queueMicrotask(() => {
        if (left instanceof Element && left.isConnected && lastFocus.current === left)
          lastFocus.current = null;
      });
    };

    element.addEventListener("focusin", onFocus);
    element.addEventListener("focusout", onBlur);

    return () => {
      element.removeEventListener("focusin", onFocus);
      element.removeEventListener("focusout", onBlur);
    };
  }, []);

  useLayoutEffect(() => {
    const focused = lastFocus.current;

    if (
      active &&
      focused &&
      !focused.isConnected &&
      (!document.activeElement || document.activeElement === document.body)
    ) {
      lastFocus.current = null;
      pageFocus().focus({ preventScroll: true });
    }
  });

  const rebase = (next: PageEditBaseline) => {
    baseline.current = next;
    setBase(next);
  };

  const navigate = useNavigate();
  const href = useRouterState({ select: (state) => state.location.href });
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Links find the site's services by name; the content API lists their entry pages
  const services = useQuery(servicesQuery(api)).data;
  const roles = useQuery(rolesQuery(api)).data;
  // Until the roles load, the visibility control waits rather than offering what the API may refuse
  const approver = roles?.includes("approver") ?? false;
  // Someone without the editor role can't save; the workspace says why
  const noEditorRole = !!roles && !roles.includes("editor");

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
    mutationFn: (current: {
      base: PageEditBaseline;
      snapshot: DraftSnapshot;
      token: PageEditLockToken;
    }) => savePageChanges(api, current.base, current.snapshot.committed, categories, current.token),
    onSuccess: (outcome, sent) => {
      if (outcome.kind === "saved") {
        // Anything since the save, even unapplied source or a recovery state, keeps the whole working copy
        let typed = store.getSnapshot() !== sent.snapshot;

        // Show what api_v2 stored when it differs from what was sent, unless more was typed during the save
        if (outcome.base.markdown !== sent.snapshot.committed && !typed) {
          if (outcome.discarded) {
            // The discarded change mustn't come back with Undo: the live page opens as a new copy
            const replacement = new DraftStore(outcome.base.markdown, govbbPageCodec);

            if (replacement.getSnapshot().valid) {
              sessions?.forget(server.id);
              setWorkingCopy((current) => ({
                store: replacement,
                revision: current.revision + 1,
              }));
            } else typed = true;
          } else {
            store.edit(outcome.base.markdown);

            if (!store.apply()) store.discard();
          }
        }

        if (outcome.discarded)
          toast("The page is no longer public", {
            description: typed
              ? "Its unpublished changes were discarded, but your open copy still contains them. Check it before you save."
              : "Its unpublished changes were discarded. It shows its last published content.",
          });

        rebase(outcome.base);
        client.setQueryData<ApiPage>(pageQuery(api, server.id).queryKey, (current) =>
          current && current.version > outcome.base.page.version ? current : outcome.base.page,
        );
        void client.invalidateQueries({ queryKey: ["content"] });
      } else if (outcome.kind === "conflict") {
        void client.invalidateQueries({
          queryKey: pageQuery(api, server.id).queryKey,
        });
      } else if (outcome.kind === "lock-lost") {
        editLock.markUnconfirmed({ kind: "lock-lost", pageId: server.id });
      } else if (outcome.kind === "outcome-unknown" || outcome.kind === "signed-out") {
        editLock.markUnconfirmed({ kind: outcome.kind });
      } else if (outcome.kind === "forbidden") {
        // A role or review-policy refusal, not lost ownership: what the editor offers is read again
        void client.invalidateQueries({ queryKey: ["me"] });
      }
    },
    onSettled: () => {
      saving.current = false;
    },
  });

  const outcome = save.isPending ? undefined : save.data;
  const uncertainWrite = outcome?.kind === "outcome-unknown";
  const stale = server.version !== base.page.version || outcome?.kind === "conflict";
  const lockToken = editLock.getEditLockToken();
  const needsReload = loadedLockToken !== lockToken || stale || uncertainWrite;

  const reloadPage = useMutation({
    mutationFn: async (token: PageEditLockToken) => {
      const snapshot = store.getSnapshot();
      const result = await api.page(server.id);

      if (editLock.getEditLockToken() !== token || store.getSnapshot() !== snapshot)
        return "Editing access or page content changed during reload. Your open changes are unchanged.";

      if (!result.ok) {
        editLock.markUnconfirmed(result.error);

        return "We could not reload this page. Your open changes are unchanged.";
      }

      const markdown = pageToMarkdown(result.value, categories);
      const replacement = new DraftStore(markdown, govbbPageCodec);

      if (!replacement.getSnapshot().valid)
        return "The saved page could not be opened. Your open changes are unchanged.";

      if (
        markdown !== baseline.current.markdown ||
        pageHasUnsavedChanges({ store, getBaseline: () => baseline.current })
      ) {
        sessions?.forget(server.id);
        setWorkingCopy((current) => ({
          store: replacement,
          revision: current.revision + 1,
        }));
      }

      rebase({ page: result.value, markdown });
      client.setQueryData<ApiPage>(pageQuery(api, server.id).queryKey, (current) =>
        current && current.version > result.value.version ? current : result.value,
      );
      save.reset();
      setLoadedLockToken(token);
      setReloadRequested(false);

      return undefined;
    },
  });

  const attemptedReloadToken = useRef<PageEditLockToken>(undefined);
  const reload = reloadPage.mutate;
  useEffect(() => {
    if (!active || !lockToken || attemptedReloadToken.current === lockToken || save.isPending)
      return;
    attemptedReloadToken.current = lockToken;

    // Every acquisition starts with a fresh read, never with another owner's unsaved work.
    if (!uncertainWrite && !pageHasUnsavedChanges({ store, getBaseline: () => baseline.current }))
      reload(lockToken);
  }, [active, lockToken, save.isPending, uncertainWrite, store, reload]);

  // Sends the saved draft, or a rejected change as it is, for review at the page version this editor holds.
  // Review steps don't need the editing lock; the version alone guards them.
  const submit = useMutation({
    mutationFn: (version: PageContentVersion) => api.submitRevision(server.id, version),
    onSuccess: (revision, version) => {
      const next = pageContentVersionSchema.safeParse(revision.version);

      // Only this editor's own confirmed step moves its baseline on, and only from the version it sent
      if (next.success && baseline.current.page.version === version) {
        const page: ApiPage = {
          ...baseline.current.page,
          version: next.data,
          pending_revision: { status: "submitted", comment: null },
        };

        rebase({ page, markdown: baseline.current.markdown });
        client.setQueryData<ApiPage>(pageQuery(api, server.id).queryKey, (current) =>
          current && current.version > page.version ? current : page,
        );
      }

      void client.invalidateQueries({ queryKey: ["content"] });
    },
    onError: (error) => {
      // The change moved on or went elsewhere: read the page again, as a refused save does
      if (error instanceof ApiFailure && (error.status === 409 || error.status === 404))
        void client.invalidateQueries({
          queryKey: pageQuery(api, server.id).queryKey,
        });
      toast("This change couldn’t be submitted for review", {
        tone: "error",
        description:
          (error instanceof ApiFailure && apiMessage(error)) ||
          "Check you are still signed in, then try again.",
      });
    },
  });

  const submitAction = (label: string) =>
    !noEditorRole && (
      <Button
        variant="secondary"
        pending={submit.isPending}
        disabled={unsaved || stale || uncertainWrite || save.isPending}
        onClick={() => submit.mutate(baseline.current.page.version)}
      >
        {label}
      </Button>
    );

  const session = useMemo<PageSession>(
    () => ({
      store,
      getBaseline: () => baseline.current,
      getEditLockToken: () =>
        active &&
        !noEditorRole &&
        !readError &&
        !needsReload &&
        !reloadPage.isPending &&
        outcome?.kind !== "missing"
          ? editLock.getEditLockToken()
          : undefined,
      isSaving: () => saving.current,
    }),
    [
      store,
      base,
      save.isPending,
      active,
      noEditorRole,
      readError,
      needsReload,
      reloadPage.isPending,
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

  // Only making a page public goes live at once; a public page's changes wait for an approver
  const publishes = visibility === "public" && server.visibility !== "public";

  const unsaved = pageHasUnsavedChanges(session);

  const blocked = !draft.valid || draft.dirty || draft.status === "error";

  const errors = outcome?.kind === "invalid" ? outcome.errors : [];

  const saveChanges = () => {
    const snapshot = store.getSnapshot();
    const editLockToken = session.getEditLockToken();

    if (
      !editLockToken ||
      saving.current ||
      submit.isPending ||
      stale ||
      !snapshot.valid ||
      snapshot.dirty ||
      snapshot.status === "error"
    )
      return;
    saving.current = true;
    save.mutate({ base: baseline.current, snapshot, token: editLockToken });
  };

  const downloadMine = () => download(store.getSnapshot().source, "page.md");

  // Source errors take precedence over the server's save state (useDraftSave).
  const standing = (): SaveStateProps => {
    if (save.isPending) return { status: "saving" };

    if (outcome?.kind === "missing")
      return {
        status: "failed",
        error:
          "This page has been deleted, so your changes can’t be saved. Download a copy to keep them.",
        onDownload: downloadMine,
      };

    if (uncertainWrite)
      return {
        status: "failed",
        error:
          "We could not confirm whether your changes were saved. Reload the page before editing again.",
        onDownload: downloadMine,
      };

    if (unsaved && (outcome?.kind === "failed" || save.isError))
      return {
        status: "failed",
        error:
          "We could not save this page. Keep this editor open to retry, or download your changes.",
        onRetry: saveChanges,
        onDownload: downloadMine,
      };

    // Live once saved only if the save publishes; otherwise while no change waits for an approver
    const live = !server.pending_revision && visibility === "public";

    return {
      status: unsaved ? (publishes ? "unpublished" : "unsaved") : live ? "published" : "saved",
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
            <Button
              variant="secondary"
              pending={reading}
              pendingLabel="Refreshing page…"
              onClick={retryRead}
            >
              Try again
            </Button>
          )}
          {readRefused && <Button onClick={downloadMine}>Download changes</Button>}
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

  const notice =
    outcome?.kind === "invalid" ? (
      <Banner tone="error" layout="strip" title="There is a problem">
        <ul className="mt-1 list-disc ps-5">
          {errors.map((error) => (
            <li key={`${error.field}:${error.message}`}>
              {pageFieldLabel(error.field)}: {error.message}
            </li>
          ))}
        </ul>
      </Banner>
    ) : outcome?.kind === "forbidden" ? (
      // A refusal, not a failure: saving again won't change the answer, so nothing offers a retry
      <Banner tone="error" layout="strip" role="alert">
        {outcome.message}
      </Banner>
    ) : outcome?.kind === "signed-out" ? (
      <Banner tone="warning" layout="strip" role="alert" actions={signInAction}>
        Your session has ended. Download your changes before signing in again; unsaved work will be
        lost when you leave.
      </Banner>
    ) : server.pending_revision?.status === "submitted" ? (
      <Banner
        tone="info"
        layout="strip"
        actions={
          approver && (
            <TextLink render={<Link to="/reviews/$pageId" params={{ pageId: server.id }} />}>
              Review this change
            </TextLink>
          )
        }
      >
        Waiting for review. Citizens will see these changes once an approver publishes them.
        {roles?.includes("editor") &&
          (approver
            ? " You can keep editing, but if you save changes you can't approve or reject this review."
            : " You can keep editing: changes you save are added to this review.")}
      </Banner>
    ) : server.pending_revision?.status === "rejected" ? (
      <Banner
        tone="warning"
        layout="strip"
        title="An approver rejected these changes"
        actions={submitAction("Submit again")}
      >
        {server.pending_revision.comment}
        {!noEditorRole && " Save your edits to start a new change, or submit it again as it is."}
      </Banner>
    ) : server.pending_revision ? (
      <Banner tone="info" layout="strip" actions={submitAction("Submit for review")}>
        Your changes are saved but not live. Submit them for review when they’re ready.
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

  const reloadError = reloadPage.isError
    ? "We could not reload this page. Your open changes are unchanged."
    : reloadPage.data;

  const editor = (
    <PageDraftEditor
      key={workingCopy.revision}
      store={store}
      active={active}
      readOnly={!session.getEditLockToken()}
      nav={nav}
      server={standing()}
      publish={
        // Keep focus when a completed save leaves nothing to save, or a newer version blocks editing.
        <Button
          variant="accent"
          pending={save.isPending}
          aria-disabled={
            !session.getEditLockToken() ||
            submit.isPending ||
            !unsaved ||
            stale ||
            blocked ||
            noEditorRole ||
            undefined
          }
          onClick={saveChanges}
        >
          {publishes ? "Publish changes" : "Save"}
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
              pageFocus={pageFocus}
            />
          )}
          {active && lockToken && needsReload && (
            <Banner
              tone="warning"
              layout="strip"
              title={uncertainWrite ? "Save outcome unknown" : undefined}
              actions={
                <>
                  <Button
                    ref={reloadTrigger}
                    variant="secondary"
                    pending={reloadPage.isPending}
                    disabled={save.isPending}
                    onClick={() => {
                      if (unsaved) setReloadRequested(true);
                      else reloadPage.mutate(lockToken);
                    }}
                  >
                    {reloadPage.isPending ? "Reloading page…" : "Reload page"}
                  </Button>
                  {unsaved && recoveryActions}
                </>
              }
            >
              {reloadError ??
                (reloadPage.isPending
                  ? "Loading the saved page before editing."
                  : "Reload the saved page to continue editing. Your open changes are read-only.")}
            </Banner>
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
        savedVisibility: base.page.visibility,
        visibilityLocked: !approver,
        errors: Object.fromEntries(errors.map((error) => [error.field, error.message])),
      }}
    />
  );

  const content = (
    <>
      <div ref={editorElement} tabIndex={-1}>
        {editor}
      </div>
      <ConfirmDialog
        open={active && reloadRequested}
        onOpenChange={(open) => {
          if (!open) setReloadRequested(false);
        }}
        title="Reload page?"
        description="This discards your unsaved changes and opens the saved page. Cancel to download your changes first."
        confirmLabel="Discard changes and reload"
        confirmDisabled={!lockToken || save.isPending}
        pending={reloadPage.isPending}
        pendingLabel="Reloading page…"
        error={reloadError}
        finalFocus={() => reloadTrigger.current ?? pageFocus()}
        onConfirm={() => {
          const token = editLock.getEditLockToken();

          if (token && !saving.current) reloadPage.mutate(token);
        }}
      />
    </>
  );

  if (!sessions) return content;
  sessions.open(server.id, String(server.version));

  return <EditorSessionProvider session={sessions.get(server.id)}>{content}</EditorSessionProvider>;
}
