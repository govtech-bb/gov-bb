import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CatchBoundary, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Category } from "../api/categories";
import { ApiFailure, outcomeUnknown, type ApiPage, type EditorApi } from "../api/client";
import { apiMessage } from "../api/failure-messages";
import { pageLinkTargetsQuery } from "../api/page-link-targets";
import { pageFieldLabel } from "../api/page-fields";
import { pageToMarkdown, pickerCategories } from "../api/page-markdown";
import {
  collectionRecordsQuery,
  PRELOAD_FRESH,
  categoriesQuery,
  rolesQuery,
  pageQuery,
  serviceQuery,
  servicesQuery,
} from "../api/queries";
import { PageDraftEditor } from "../host/page-editor";
import { download } from "../host/download";
import { collectInternalPageLinks } from "../pages/link-checks";
import { draftPageMetadata, readPageMetadata } from "../pages";
import { PageCollectionsProvider, type PageCollections } from "../pages/modules/contact";
import { DraftStore } from "../persistence/draft-store";
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
import { createEditorSession } from "@/editor";
import { EditorSessionProvider } from "@/editor/react";
import type { DocumentSessions } from "./document-views";
import { brokenLinks, linkConfirmation } from "./broken-links";
import type { PageSession, ServerPageBaseline } from "./page-session";
import {
  landedSubmission,
  preparePageSave,
  retryPageSave,
  saveLanded,
  sendPageSave,
  submissionLanded,
  type PageSaveAttempt,
  type PageSaveOutcome,
} from "./page-sync";
import type { DraftSnapshot } from "../persistence/types";
import { ContentDiff } from "./review-screens";
import { forgetUnsavedWork, UnsavedWorkOffer, useUnsavedWork } from "./unsaved-work";

type SessionListener = (id: string, session: PageSession | undefined) => void;

/**
 * An API page opens directly into an in-memory editor, as the API has it. Browser storage only keeps its unsaved
 * changes, to offer them back after a reload (useUnsavedWork).
 */
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
  /** Page navigation at the start of the bar, such as the service sidebar toggle or site-page history. */
  nav?: ReactNode;
}) {
  const opened = useRef(false);
  const [generation, setGeneration] = useState(0);
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

  const editor = (
    <RemotePageEditor
      key={`${id}-${generation}`}
      focusOnOpen={generation > 0}
      resetEditor={() => {
        sessions?.forget(id);
        setGeneration((value) => value + 1);
      }}
      api={api}
      page={page.data}
      categories={categories.data}
      active={active}
      onSession={onSession}
      nav={nav}
      readError={page.error ?? categories.error}
      reading={page.isFetching || categories.isFetching}
      retryRead={() => {
        void page.refetch();
        void categories.refetch();
      }}
    />
  );

  if (!sessions) return editor;
  sessions.open(id, page.data.version);

  return (
    <EditorSessionProvider key={generation} session={sessions.get(id, createEditorSession)}>
      {editor}
    </EditorSessionProvider>
  );
}

function RemotePageEditor({
  api,
  page: server,
  categories,
  active,
  onSession,
  nav,
  readError,
  reading,
  retryRead,
  resetEditor,
  focusOnOpen,
}: {
  api: EditorApi;
  page: ApiPage;
  categories: readonly Category[];
  active: boolean;
  onSession: SessionListener;
  nav?: ReactNode;
  readError: Error | null;
  reading: boolean;
  retryRead: () => void;
  resetEditor: () => void;
  focusOnOpen: boolean;
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
  const [keptWork, answerKeptWork] = useUnsavedWork(server.id, draft.committed, base);
  // Links find the site's services by name; the content API lists their entry pages
  const services = useQuery(servicesQuery(api)).data;
  const rolesRead = useQuery(rolesQuery(api));
  const roles = rolesRead.data;
  // Until the roles load, the visibility control waits rather than offering what the API may refuse
  const approver = roles?.includes("approver") ?? false;
  // They couldn't be read: the control says so, rather than that it's only for approvers
  const unchecked = !roles && rolesRead.errorUpdateCount > 0;
  // Someone without the editor role can't save; the workspace says why
  const readOnly = !!roles && !roles.includes("editor");

  const service = services?.find(
    (item) => server.id === item.id || server.url.startsWith(`${item.url}/`),
  );

  const servicePages = useQuery({
    ...serviceQuery(api, service?.id ?? ""),
    enabled: !!service,
  }).data;

  const metadata = useMemo(() => draftPageMetadata(draft), [draft]);

  const previewContext = useMemo(() => {
    const path = metadata.url ?? server.url;
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
  }, [metadata.url, server.url, server.published_at, categories, service, servicePages]);

  // Contact blocks show their records' current details, and open a record on the collection's screen (#3184)
  const collections = useMemo<PageCollections>(
    () => ({
      read: (key) => client.fetchQuery(collectionRecordsQuery(api, key)),
      openRecord: (collection, record) =>
        void navigate({
          href: `/collections/${encodeURIComponent(collection)}?record=${encodeURIComponent(record)}`,
        }),
    }),
    [api, client, navigate],
  );

  const linkPages = useMemo(
    () => services?.map((service) => ({ title: service.title, url: service.url })),
    [services],
  );

  // Links to pages the site doesn't have warn as the page is written, and are checked again before each save
  const pageUrl = metadata.url ?? server.url;

  const links = useMemo(
    () => (draft.state ? collectInternalPageLinks(draft.state, pageUrl) : []),
    [draft.state, pageUrl],
  );

  const known = useQuery({ ...pageLinkTargetsQuery(api), enabled: links.length > 0 });
  // A refetch that failed keeps its last data, which is no evidence about the links now
  const listed = known.isError ? undefined : known.data;
  const broken = listed ? brokenLinks(links, listed, pageUrl) : [];
  const [checking, setChecking] = useState(false);

  const [confirming, setConfirming] = useState<{
    markdown: string;
    title: string;
    message: string;
  }>();

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const [localOutcome, setLocalOutcome] = useState<PageSaveOutcome>();
  const attempt = useRef<{ request: PageSaveAttempt; snapshot: DraftSnapshot }>(undefined);

  const save = useMutation({
    mutationFn: (current: { request: PageSaveAttempt; snapshot: DraftSnapshot; retry?: true }) =>
      (current.retry ? retryPageSave : sendPageSave)(api, current.request),
    onSuccess: (outcome, sent) => {
      if (outcome.kind !== "unknown" && outcome.kind !== "conflict") attempt.current = undefined;

      if (outcome.kind === "saved") {
        // Show what api_v2 stored when it differs from what was sent, unless more was typed during the save
        const typed = store.getSnapshot() !== sent.snapshot;

        if (outcome.base.markdown !== sent.request.markdown && !typed) {
          const token = store.captureReplacementToken();
          const prepared = govbbPageCodec.prepare(outcome.base.markdown);
          store.replacePrepared(prepared, token);
        }

        attempt.current = undefined;

        if (outcome.discarded)
          toast("The page is no longer public", {
            description: typed
              ? "Its unpublished changes were discarded, but your open copy still contains them. Check it before you save."
              : "Its unpublished changes were discarded. It shows its last published content.",
          });

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

  const submitAttempt = useRef<ServerPageBaseline>(undefined);

  const submit = useMutation({
    mutationFn: async (sent: ServerPageBaseline & { retry?: true }): Promise<ApiPage> => {
      const landed = sent.retry ? await landedSubmission(api, sent, categories) : undefined;

      if (landed) return landed;
      const revision = await api.submitRevision(server.id, sent.page.version);

      return {
        ...sent.page,
        version: revision.version,
        updated_at: revision.updated_at,
        pending_revision: { status: revision.status, comment: revision.comment },
      };
    },
    onSuccess: (confirmed, sent) => {
      rebase({ page: confirmed, markdown: sent.markdown });
      submitAttempt.current = undefined;
      client.setQueryData(pageQuery(api, server.id).queryKey, confirmed);
      void client.invalidateQueries({ queryKey: ["content"] });
    },
    onSettled: () => {
      saving.current = false;
    },
    onError: (error) => {
      if (!outcomeUnknown(error)) submitAttempt.current = undefined;

      // The change moved on or went elsewhere: read the page again, as a refused save does
      if (error instanceof ApiFailure && (error.status === 409 || error.status === 404))
        void client.invalidateQueries({ queryKey: pageQuery(api, server.id).queryKey });
      toast("This change couldn’t be submitted for review", {
        tone: "error",
        description:
          (error instanceof ApiFailure && apiMessage(error)) ||
          "Check you are still signed in, then try again.",
      });
    },
  });

  const submitAction = (label: string) =>
    !readOnly && (
      <Button
        variant="secondary"
        pending={submit.isPending}
        disabled={unsaved || stale || blocked || save.isPending || checking || !!attempt.current}
        onClick={() => {
          if (saving.current) return;
          saving.current = true;
          submitAttempt.current ??= structuredClone(baseline.current);
          submit.mutate(submitAttempt.current);
        }}
      >
        {label}
      </Button>
    );

  const session = useMemo<PageSession>(
    () => ({
      store,
      getBaseline: () => baseline.current,
      isSaving: () => saving.current,
    }),
    [store, base, save.isPending, checking],
  );

  useEffect(() => {
    onSession(server.id, session);

    return () => onSession(server.id, undefined);
  }, [onSession, server.id, session]);

  const visibility = metadata.visibility || "public";

  // Only making a page public goes live at once; a public page's changes wait for an approver
  const publishes = visibility === "public" && server.visibility !== "public";

  const outcome = save.isPending ? undefined : (localOutcome ?? save.data);

  const unsaved =
    draft.committed !== base.markdown || draft.dirty || !draft.valid || draft.status === "error";

  // While a request's answer is lost, a newer version holding exactly what it sent is that request landing, not someone
  // else's change: retrying it confirms it
  const landedMeanwhile =
    (outcome?.kind === "unknown" &&
      !!attempt.current &&
      saveLanded(server, attempt.current.request)) ||
    (outcomeUnknown(submit.error) &&
      !!submitAttempt.current &&
      submissionLanded(server, submitAttempt.current, categories));

  const stale =
    (server.version !== base.page.version && !landedMeanwhile) ||
    outcome?.kind === "conflict" ||
    (submit.error instanceof ApiFailure && submit.error.code === "version_conflict");

  const blocked = !draft.valid || draft.dirty || draft.status === "error";

  const errors = outcome?.kind === "invalid" ? outcome.errors : [];

  const saveDraft = () => {
    const snapshot = store.getSnapshot();

    if (
      saving.current ||
      stale ||
      attempt.current ||
      submitAttempt.current ||
      !snapshot.valid ||
      snapshot.dirty ||
      snapshot.status === "error"
    )
      return;
    const prepared = preparePageSave(baseline.current, snapshot.committed, categories);

    if (!prepared.ok) return setLocalOutcome(prepared.outcome);
    setLocalOutcome(undefined);
    saving.current = true;
    attempt.current = { request: prepared.attempt, snapshot };
    save.mutate(attempt.current);
  };

  // The same request again: one that landed meanwhile is confirmed rather than refused as a conflict (retryPageSave)
  const retrySave = () => {
    if (saving.current || !attempt.current) return;
    saving.current = true;
    save.mutate({ ...attempt.current, retry: true });
  };

  // Looks the page's links up again, then saves. Only making the page public stops to ask about what it found.
  const checkedSave = async () => {
    const snapshot = store.getSnapshot();

    if (
      saving.current ||
      stale ||
      !snapshot.valid ||
      snapshot.dirty ||
      snapshot.status === "error" ||
      !snapshot.state ||
      !collectInternalPageLinks(snapshot.state, pageUrl).length
    )
      return saveDraft();

    // Held like a save, so a second click is ignored and leaving the page waits for it
    saving.current = true;
    setChecking(true);
    let fresh: readonly string[] | undefined;

    try {
      fresh = await client.fetchQuery({ ...pageLinkTargetsQuery(api), staleTime: 0 });
    } catch {
      fresh = undefined;
    }

    saving.current = false;

    if (!mounted.current) return;
    setChecking(false);

    // What is checked is what is sent: the page as it stands now
    const latest = store.getSnapshot();

    if (!latest.state || !latest.valid || latest.dirty || latest.status === "error") return;
    const latestUrl = readPageMetadata(latest.committed).url ?? server.url;
    const found = collectInternalPageLinks(latest.state, latestUrl);

    const makesPublic =
      (readPageMetadata(latest.committed).visibility || "public") === "public" &&
      server.visibility !== "public";

    const asked = makesPublic
      ? linkConfirmation(
          fresh ? brokenLinks(found, fresh, latestUrl) : [],
          found.length > 0 && !fresh,
        )
      : undefined;

    if (asked) setConfirming({ markdown: latest.committed, ...asked });
    else saveDraft();
  };

  // Preview has no heading in its bar; its Close preview control stays when an alert is answered. The other open pages
  // are kept hidden and inert, so their headings can't take the focus
  const restorePageFocus = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "[data-cms-preview-host] [data-site-preview-trigger], [data-document-bar]:not([hidden]) h1",
      ),
    ]
      .find((element) => !element.closest("[inert]"))
      ?.focus();

  useEffect(() => {
    if (focusOnOpen) restorePageFocus();
  }, [focusOnOpen]);
  const [reloading, setReloading] = useState(false);

  const loadSaved = async () => {
    if (saving.current) return;
    saving.current = true;
    setReloading(true);
    const before = store.getSnapshot();

    try {
      const latest = await api.page(server.id);
      const listed = await api.categories();

      if (!listed.ok) throw listed.error;
      const markdown = pageToMarkdown(latest, listed.value);
      const replacement = new DraftStore(markdown, govbbPageCodec);

      if (!replacement.getSnapshot().valid) throw new Error("The saved page could not be parsed.");

      if (!mounted.current || store.getSnapshot() !== before)
        throw new Error("Your draft changed while reloading. Check it before discarding.");
      client.setQueryData(categoriesQuery(api).queryKey, listed.value);
      client.setQueryData(pageQuery(api, server.id).queryKey, latest);

      // What this browser kept of the open copy goes with it; changes still on offer stay, to be offered again
      if (!keptWork) forgetUnsavedWork(server.id);
      resetEditor();
      restorePageFocus();
    } catch (error) {
      toast("The saved version couldn’t be opened", {
        tone: "error",
        description: `Your open copy is unchanged. ${error instanceof Error ? error.message : ""}`,
      });
    } finally {
      saving.current = false;
      setReloading(false);
    }
  };

  const restoreKeptWork = () => {
    // Waits for a save still to be answered: its answer would move the page on, under what was restored
    if (!keptWork || saving.current || attempt.current || submitAttempt.current) return;

    const restored = store.replacePrepared(
      govbbPageCodec.prepare(keptWork.markdown),
      store.captureReplacementToken(),
    );

    if (restored.status === "rejected") {
      toast("Your changes couldn’t be restored", {
        tone: "error",
        description: `The page is unchanged. ${restored.message}`,
      });

      return;
    }

    // Written over a version the page has since moved past: the page stands on that version again, so it shows as
    // saved since and api_v2 refuses a save over what is there now
    if (keptWork.version !== baseline.current.page.version)
      rebase({
        ...baseline.current,
        page: { ...baseline.current.page, version: keptWork.version },
      });
    answerKeptWork();
    restorePageFocus();
  };

  const keptNotice = keptWork && (
    <UnsavedWorkOffer
      kept={keptWork}
      onRestore={restoreKeptWork}
      onDiscard={() => {
        answerKeptWork();
        restorePageFocus();
      }}
    />
  );

  const newerVersion = "A newer version of this page has been saved since you opened it.";
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

    if (outcome?.kind === "unknown" || save.isError)
      return {
        status: "failed",
        error:
          "We couldn’t confirm the save. Retry the same request, or copy your changes and reload.",
        onRetry: retrySave,
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

  // Its alert beside the title says so in a word or two
  const readLabel =
    readStatus === 401
      ? "Session ended"
      : readStatus === 403
        ? "No access"
        : readStatus === 404
          ? "Page unavailable"
          : "Couldn’t refresh";

  // Read out by its alert as it arrives, so the notice itself isn't
  const readNotice = readError && (
    <Banner
      tone={readRefused ? "error" : "warning"}
      layout="strip"
      role="none"
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

  // Read out by its alert as it arrives, so the notice itself isn't
  const newer = (stale || outcome?.kind === "unknown" || outcomeUnknown(submit.error)) && (
    <Banner
      tone="warning"
      layout="strip"
      role="none"
      actions={
        <>
          {outcome?.kind === "unknown" && (
            <Button disabled={save.isPending || submit.isPending || reloading} onClick={retrySave}>
              Retry same save
            </Button>
          )}
          {outcomeUnknown(submit.error) && (
            <Button
              disabled={save.isPending || submit.isPending || reloading}
              onClick={() => {
                if (saving.current || !submitAttempt.current) return;
                saving.current = true;
                // One that landed meanwhile is confirmed rather than refused as a conflict (landedSubmission)
                submit.mutate({ ...submitAttempt.current, retry: true });
              }}
            >
              Retry same submission
            </Button>
          )}
          <Button
            variant="danger"
            pending={reloading}
            disabled={save.isPending || submit.isPending}
            onClick={() => void loadSaved()}
          >
            Discard my changes and reload
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(store.getSnapshot().source)
                .catch(() => downloadMine())
            }
          >
            Copy my version
          </Button>
          <Button onClick={downloadMine}>Download my version</Button>
        </>
      }
    >
      <p>
        {stale
          ? newerVersion
          : "We couldn’t confirm the last request. Check the saved version without discarding your open copy."}
      </p>
      <p className="text-14 text-muted">
        Struck-through lines are only in the latest saved version, shown here read-only. Highlighted
        lines are only in your open copy.
      </p>
      <ContentDiff live={pageToMarkdown(server, categories)} proposed={draft.source} />
    </Banner>
  );

  const invalid = outcome?.kind === "invalid";

  const notice = invalid ? (
    <Banner tone="error" layout="strip" title="There is a problem">
      <ul className="mt-1 list-disc ps-5">
        {errors.map((error) => (
          <li key={`${error.field}:${error.message}`}>
            {pageFieldLabel(error.field)}: {error.message}
          </li>
        ))}
      </ul>
    </Banner>
  ) : outcome?.kind === "forbidden" || outcome?.kind === "refused" ? (
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
          ? " You can keep editing, but if you save changes you can’t approve or reject this review."
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
      {!readOnly && " Save your edits to start a new change, or submit it again as it is."}
    </Banner>
  ) : server.pending_revision ? (
    <Banner tone="info" layout="strip" actions={submitAction("Submit for review")}>
      Your changes are saved but not live. Submit them for review when they’re ready.
    </Banner>
  ) : undefined;

  return (
    <PageCollectionsProvider collections={collections}>
      {/* A failure showing the page fails only its pane. Its draft is kept here, outside, as is leaving's question about
          it: it can be downloaded, or shown again */}
      <CatchBoundary
        getResetKey={() => server.id}
        errorComponent={({ reset }) =>
          active ? (
            <>
              {nav && <Bar.Root>{nav}</Bar.Root>}
              <EmptyState
                tone="error"
                size="page"
                title="This page couldn’t be shown"
                description="Your changes are still here. Download a copy to keep them, then try again."
                actions={
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        document.getElementById("workspace-content")?.focus();
                        reset();
                      }}
                    >
                      Try again
                    </Button>
                    <Button onClick={downloadMine}>Download a copy</Button>
                  </>
                }
              />
            </>
          ) : null
        }
      >
        <PageDraftEditor
          store={store}
          active={active}
          nav={nav}
          server={standing()}
          publish={
            // Keep focus when a completed save leaves nothing to save, or a newer version blocks editing.
            <Button
              variant="accent"
              pending={save.isPending || checking || submit.isPending || reloading}
              aria-disabled={
                !unsaved || stale || blocked || readOnly || outcome?.kind === "missing" || undefined
              }
              onClick={() => void checkedSave()}
            >
              {publishes ? "Publish changes" : "Save"}
            </Button>
          }
          notice={
            keptNotice ? (
              <>
                {keptNotice}
                {notice}
              </>
            ) : (
              notice
            )
          }
          alert={
            readNotice
              ? {
                  label: readLabel,
                  tone: readRefused ? "error" : "warning",
                  content: (
                    <>
                      {readNotice}
                      {newer}
                    </>
                  ),
                }
              : newer
                ? { label: "Newer version saved", tone: "warning", content: newer }
                : undefined
          }
          linkPages={linkPages}
          linkWarnings={{
            broken,
            unavailable: links.length > 0 && known.isError,
            retrying: known.isFetching,
            onRetry: () => void known.refetch(),
          }}
          previewContext={previewContext}
          settings={{
            ...(base.page.parent_id === null &&
              base.page.category_id !== null && {
                categories: pickerCategories(categories),
                single: true,
              }),
            publishedAt: server.published_at,
            lastEditedBy: server.last_edited_by,
            savedVisibility: base.page.visibility,
            visibilityLocked: approver
              ? undefined
              : unchecked
                ? "We couldn’t check your permissions, so who can see this page can’t be changed until we can."
                : "Only approvers can change who can see this page.",
            errors: Object.fromEntries(errors.map((error) => [error.field, error.message])),
          }}
        />
      </CatchBoundary>
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(next) => {
          if (!next) setConfirming(undefined);
        }}
        title={confirming?.title ?? ""}
        description={`${confirming?.message ?? ""} Citizens will see this page straight away.`}
        confirmLabel="Publish changes"
        variant="accent"
        onConfirm={() => {
          const asked = confirming;
          setConfirming(undefined);

          // Only the page that was shown is published
          if (asked?.markdown === store.getSnapshot().committed) saveDraft();
          else toast("The page changed", { description: "Publish it again to check its links." });
        }}
      />
    </PageCollectionsProvider>
  );
}
