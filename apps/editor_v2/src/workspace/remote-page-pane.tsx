import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CatchBoundary, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Category } from "../api/categories";
import { ApiFailure, type ApiPage, type EditorApi } from "../api/client";
import type { Outcome } from "../api/write-attempt";
import { writes, type PageSaveAnswer, type ServerPageBaseline } from "../api/writes";
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
import type { PageSession } from "./page-session";
import { preparePageSave } from "./page-sync";
import { useWrite } from "./use-write";
import type { DraftSnapshot } from "../persistence/types";
import { ContentDiff } from "./review-screens";
import {
  forgetUnsavedWork,
  keepUnsavedWork,
  recoveredPageBaseline,
  useUnsavedWork,
} from "./unsaved-work";
import { UnsavedWorkOffer } from "./unsaved-work-offer";

type SessionListener = (id: string, session: PageSession | undefined) => void;

/** Opens API content first; browser recovery requires an explicit restore. */
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
  const [savedBase, setBase] = useState<ServerPageBaseline>(() => ({
    page: server,
    markdown: pageToMarkdown(server, categories),
  }));

  const [store] = useState(() => new DraftStore(savedBase.markdown, govbbPageCodec));
  const baseline = useRef(savedBase);
  const saving = useRef(false);

  const rebase = (next: ServerPageBaseline) => {
    baseline.current = next;
    setBase(next);
  };

  const client = useQueryClient();
  const navigate = useNavigate();
  const href = useRouterState({ select: (state) => state.location.href });
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const base = useMemo(
    () => recoveredPageBaseline(savedBase, draft.state),
    [savedBase, draft.state],
  );

  const [keptWork, answerKeptWork] = useUnsavedWork(server.id, draft.committed, base);
  const [discardingKeptWork, setDiscardingKeptWork] = useState(false);
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

  const [localOutcome, setLocalOutcome] = useState<Outcome<PageSaveAnswer>>();
  // The editor snapshot identifies typing after dispatch; the attempt owns the request itself.
  const savedSnapshot = useRef<DraftSnapshot>(undefined);
  const save = useWrite(api, writes.savePage);
  const submit = useWrite(api, writes.submitRevision);
  const savePending = save.state === "sending" || save.state === "checking";
  const submitPending = submit.state === "sending" || submit.state === "checking";

  const saved = useEffectEvent((outcome: Outcome<PageSaveAnswer>) => {
    if (outcome.kind === "landed") {
      const answer = outcome.answer;
      const typed = store.getSnapshot() !== savedSnapshot.current;

      if (answer.base.markdown !== savedSnapshot.current?.committed && !typed) {
        const token = store.captureReplacementToken();
        const prepared = govbbPageCodec.prepare(answer.base.markdown);
        store.replacePrepared(prepared, token);
      }

      if (answer.discarded)
        toast("The page is no longer public", {
          description: typed
            ? "Its unpublished changes were discarded, but your open copy still contains them. Check it before you save."
            : "Its unpublished changes were discarded. It shows its last published content.",
        });

      rebase(answer.base);
      client.setQueryData(pageQuery(api, server.id).queryKey, answer.base.page);
    } else if (outcome.kind === "conflict")
      void client.invalidateQueries({ queryKey: pageQuery(api, server.id).queryKey });
    saving.current = false;
  });

  // Before paint, so a landed save never shows for a frame as unsaved changes
  useLayoutEffect(() => {
    if (save.outcome) saved(save.outcome);
  }, [save.outcome]);

  const submitted = useEffectEvent((outcome: Outcome<ServerPageBaseline>) => {
    if (outcome.kind === "landed") {
      rebase(outcome.answer);
      client.setQueryData(pageQuery(api, server.id).queryKey, outcome.answer.page);
    } else {
      if (outcome.kind === "conflict" || outcome.kind === "missing" || outcome.kind === "refused")
        void client.invalidateQueries({ queryKey: pageQuery(api, server.id).queryKey });
      toast(
        outcome.kind === "unknown"
          ? "We couldn’t confirm the last request."
          : "This change couldn’t be submitted for review",
        {
          tone: "error",
          description:
            outcome.kind === "unknown"
              ? "Check the saved version without discarding your open copy."
              : outcome.message || "Check you are still signed in, then try again.",
        },
      );
    }

    saving.current = false;
  });

  useLayoutEffect(() => {
    if (submit.outcome) submitted(submit.outcome);
  }, [submit.outcome]);

  const submitPage = () => {
    if (saving.current || save.state === "unsettled") return;
    saving.current = true;
    void submit.press(() => ({ base: session.getBaseline(), categories }));
  };

  const submitAction = (label: string) =>
    !readOnly && (
      <Button
        variant="secondary"
        pending={submitPending}
        disabled={
          unsaved || stale || blocked || savePending || checking || save.state === "unsettled"
        }
        onClick={submitPage}
      >
        {label}
      </Button>
    );

  const session = useMemo<PageSession>(
    () => ({
      store,
      getBaseline: () => recoveredPageBaseline(baseline.current, store.getSnapshot().state),
      isSaving: () => saving.current,
    }),
    [store, base, savePending, submitPending, checking],
  );

  useEffect(() => {
    onSession(server.id, session);

    return () => onSession(server.id, undefined);
  }, [onSession, server.id, session]);

  const visibility = metadata.visibility || "public";

  // Only making a page public goes live at once; a public page's changes wait for an approver
  const publishes = visibility === "public" && server.visibility !== "public";

  const outcome = savePending ? undefined : (localOutcome ?? save.outcome);

  const unsaved =
    draft.committed !== base.markdown || draft.dirty || !draft.valid || draft.status === "error";

  // A refreshed version may be this write's own result, including before its landed answer becomes the baseline.
  const savedVersion =
    save.outcome?.kind === "landed" ? save.outcome.answer.base.page.version : undefined;

  const submittedVersion =
    submit.outcome?.kind === "landed" ? submit.outcome.answer.page.version : undefined;

  const unsettled = save.state === "unsettled" || submit.state === "unsettled";

  // A page's version only rises, so a read older than the baseline is a lagging read, not someone else's change.
  const stale =
    (!savePending &&
      !submitPending &&
      !unsettled &&
      server.version > base.page.version &&
      server.version !== savedVersion &&
      server.version !== submittedVersion) ||
    outcome?.kind === "conflict" ||
    submit.outcome?.kind === "conflict";

  const blocked = !draft.valid || draft.dirty || draft.status === "error";

  const errors = outcome?.kind === "invalid" ? outcome.errors : [];

  const saveDraft = () => {
    const snapshot = store.getSnapshot();

    if (
      saving.current ||
      stale ||
      unsettled ||
      !snapshot.valid ||
      snapshot.dirty ||
      snapshot.status === "error"
    )
      return;

    const prepared = preparePageSave(session.getBaseline(), snapshot.committed, categories);

    if (!prepared.ok) return setLocalOutcome(prepared.outcome);
    setLocalOutcome(undefined);
    saving.current = true;
    void save.press(() => {
      savedSnapshot.current = snapshot;

      return prepared.request;
    });
  };

  const retrySave = () => {
    if (saving.current || save.state !== "unsettled") return;
    saving.current = true;
    void save.press(() => {
      // An unsettled press must not ask for new input, including invalid source typed since dispatch.
      throw new Error("An unsettled page save must reuse its frozen request.");
    });
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
      save.forget();
      submit.forget();

      // Edits typed over an unanswered recovery offer replaced it in storage; put it back to be offered again.
      if (keptWork) keepUnsavedWork(server.id, keptWork);
      else forgetUnsavedWork(server.id);
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

  const restoreBlocked =
    savePending || submitPending || checking || reloading
      ? "Wait for the current request to finish before restoring."
      : unsettled
        ? "Retry the last request before restoring these changes."
        : undefined;

  const restoreKeptWork = () => {
    if (!keptWork || saving.current || restoreBlocked) return;
    const prepared = govbbPageCodec.prepare(keptWork.markdown);

    // Root NodeState travels with undo/redo but is not written to the page's Markdown.
    if (
      prepared.state &&
      prepared.source !== store.getSnapshot().committed &&
      keptWork.version !== baseline.current.page.version
    )
      prepared.state.root.$ = { ...prepared.state.root.$, recoveredPageVersion: keptWork.version };

    const restored = store.replacePrepared(prepared, store.captureReplacementToken());

    if (restored.status === "rejected") {
      toast("Your changes couldn’t be restored", {
        tone: "error",
        description: `The page is unchanged. ${restored.message}`,
      });

      return;
    }

    // Unsupported pages have no visual editor or undo history.
    if (!prepared.state)
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
      restoreBlocked={restoreBlocked}
      onRestore={restoreKeptWork}
      onDiscard={() => setDiscardingKeptWork(true)}
    />
  );

  const newerVersion = "A newer version of this page has been saved since you opened it.";
  const downloadMine = () => download(store.getSnapshot().source, "page.md");

  // Source errors take precedence over the server's save state (useDraftSave).
  const standing = (): SaveStateProps => {
    if (savePending) return { status: "saving" };

    if (outcome?.kind === "missing")
      return {
        status: "failed",
        error:
          "This page has been deleted, so your changes can’t be saved. Download a copy to keep them.",
        onDownload: downloadMine,
      };

    if (outcome?.kind === "unknown")
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
  const newer = (stale || outcome?.kind === "unknown" || submit.outcome?.kind === "unknown") && (
    <Banner
      tone="warning"
      layout="strip"
      role="none"
      actions={
        <>
          {outcome?.kind === "unknown" && (
            <Button disabled={savePending || submitPending || reloading} onClick={retrySave}>
              Retry same save
            </Button>
          )}
          {submit.outcome?.kind === "unknown" && (
            <Button disabled={savePending || submitPending || reloading} onClick={submitPage}>
              Retry same submission
            </Button>
          )}
          <Button
            variant="danger"
            pending={reloading}
            disabled={savePending || submitPending}
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
      {outcome.message ??
        (outcome.kind === "forbidden"
          ? "You don’t have permission to save this change."
          : "This request could not be saved.")}
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
              pending={savePending || checking || submitPending || reloading}
              aria-disabled={
                !unsaved || stale || blocked || readOnly || outcome?.kind === "missing" || undefined
              }
              onClick={() => void checkedSave()}
            >
              {publishes ? "Publish changes" : "Save"}
            </Button>
          }
          notice={
            <>
              {keptNotice}
              {notice}
            </>
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
        open={discardingKeptWork}
        onOpenChange={setDiscardingKeptWork}
        title="Discard recovered changes?"
        description="The changes kept in this browser will be deleted. Your open page will stay as it is."
        confirmLabel="Discard changes"
        finalFocus={() => {
          if (keptWork) return true;
          restorePageFocus();

          return false;
        }}
        onConfirm={() => {
          setDiscardingKeptWork(false);
          answerKeptWork();
        }}
      />
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
