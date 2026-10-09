import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ApiPage, EditorApi, PageDraft, PageLock } from "../api/client";
import { lockQuery, pageQuery, taxonomyQuery } from "../api/queries";
import { PageDraftEditor } from "../host/page-editor";
import { download, type ServerSaveStatus } from "../host/source-ui";
import { Button } from "../ui/button";
import { PageHistoryDialog } from "./api-history";
import { fieldLabel } from "./api-pages";
import { WorkspaceDialog } from "./dialogs";
import { flushDocument } from "./model";
import { ApiPageDetails } from "./page-details-panel";
import { PageSession, type PageSessionSnapshot } from "./page-session";

/** A page from the content API with its draft, if it has one, loaded before the editor opens it. */
export function ApiPagePane({ api, id, active }: { api: EditorApi; id: string; active: boolean }) {
  const client = useQueryClient();

  // Read once per opening: the editor then holds the working copy, and the next opening reads the draft afresh.
  const opened = useQuery({
    queryKey: ["opened", id],
    queryFn: async () => {
      const [page, draft, lock] = await Promise.all([
        client.fetchQuery(pageQuery(api, id)),
        api.draft(id),
        api.editor(id),
        client.ensureQueryData(taxonomyQuery(api)),
      ]);

      return { page, draft, lock };
    },
    staleTime: Infinity,
    gcTime: 0,
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

  return (
    <ApiPageEditor
      api={api}
      page={opened.data.page}
      draft={opened.data.draft}
      lock={opened.data.lock}
      active={active}
    />
  );
}

const noticeClass = "page-document-paused flex flex-wrap items-center gap-x-3 gap-y-2";

/** How the toolbar reports the working copy against what is published. */
function saveStatusOf(session: PageSessionSnapshot, publishing: boolean): ServerSaveStatus {
  // Held for the author's choice between this copy and the work saved elsewhere.
  if (session.newer && session.changed) return "unsaved";

  if (publishing || session.saving === "pending" || session.saving === "saving") return "saving";

  if (session.saving === "failed") return "failed";

  return session.changed ? "drafted" : "saved";
}

function ApiPageEditor({
  api,
  page,
  draft,
  lock,
  active,
}: {
  api: EditorApi;
  page: ApiPage;
  draft: PageDraft | null;
  lock: PageLock | null;
  active: boolean;
}) {
  const [session] = useState(() => new PageSession(api, page, draft, lock));
  const client = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const editing = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const working = useSyncExternalStore(session.store.subscribe, session.store.getSnapshot);
  const categories = useQuery(taxonomyQuery(api)).data ?? [];
  const server = useQuery(pageQuery(api, page.id)).data ?? page;
  const [failure, setFailure] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const { published, newer, details, changed, lockedBy } = editing;

  // Read whenever the page comes into view, and while someone else holds it, so read-only follows their claim.
  const editor = useQuery({
    ...lockQuery(api, page.id),
    enabled: active,
    refetchInterval: lockedBy ? 30_000 : false,
  });

  // The content API is the external system here: its newer versions and claims reach the session, and leaving saves what it does not have.
  useEffect(() => session.follow(server), [session, server]);
  useEffect(() => {
    if (editor.data !== undefined) void session.lockIs(editor.data);
  }, [session, editor.data]);
  useEffect(() => session.attach(), [session]);
  // A page out of view lets others edit it, once what it has is saved.
  useEffect(() => {
    if (!active) void session.leave();
  }, [session, active]);

  const publish = useMutation({
    mutationFn: () => session.publish(),
    onSuccess: (outcome) => {
      if (outcome.kind === "saved") {
        client.setQueryData(pageQuery(api, page.id).queryKey, outcome.base.page);
        void client.invalidateQueries({ queryKey: ["content"] });
      } else if (outcome.kind === "conflict")
        void client.invalidateQueries({ queryKey: pageQuery(api, page.id).queryKey });
    },
  });

  const discard = useMutation({
    mutationFn: () => session.discard(),
    onError: () => setFailure("We could not discard your changes. Try again."),
  });

  const takeOver = useMutation({ mutationFn: () => session.takeOver() });

  // Every open page guards closing the tab, since panes stay mounted; only the one in view guards navigation.
  useBlocker({
    enableBeforeUnload: () => {
      try {
        if (active) flushDocument(session.store);

        return session.unsaved();
      } catch {
        return true;
      }
    },
    shouldBlockFn: () => {
      if (!active) return false;

      try {
        flushDocument(session.store);
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

  const outcome = publish.isPending ? undefined : publish.data;

  const blocked =
    !!lockedBy ||
    !working.valid ||
    working.dirty ||
    !!working.conflict ||
    !!working.replacement ||
    !!working.recovery ||
    working.status === "error";

  const errors = outcome?.kind === "invalid" ? outcome.errors : [];

  // The body alone would lose unsaved details, so the copy is the whole page as a save sends it.
  const downloadMine = () =>
    download(
      JSON.stringify({ ...details, body_markdown: working.committed }, null, 2),
      "page.json",
    );

  const notice = lockedBy ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">
        {editing.takenOver
          ? `${lockedBy.name} took over editing this page. Your latest changes may not have been saved.`
          : `${lockedBy.name} is editing this page. Taking over stops their editing, and they lose changes they have not saved.`}
        {takeOver.isError && " We could not take over this page. Try again."}
      </p>
      <Button variant="secondary" disabled={takeOver.isPending} onClick={() => takeOver.mutate()}>
        Take over
      </Button>
    </div>
  ) : newer ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">A newer version of this page has been saved since you opened it.</p>
      <Button variant="secondary" onClick={session.keepMine}>
        Keep my version
      </Button>
      <Button variant="secondary" disabled={blocked} onClick={() => void session.loadNewer()}>
        Load saved version
      </Button>
      {changed && <Button onClick={downloadMine}>Download my version</Button>}
    </div>
  ) : outcome?.kind === "invalid" ? (
    <div role="alert" className="page-document-paused">
      <p className="font-semibold">There is a problem</p>
      <ul className="mt-1 list-disc ps-5">
        {errors.map((error) => (
          <li key={`${error.field}:${error.message}`}>
            {fieldLabel(error.field)}: {error.message}
          </li>
        ))}
      </ul>
    </div>
  ) : outcome?.kind === "signed-out" ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">
        Your session has ended. Download your changes, then sign in again to save them.
      </p>
      <Button onClick={downloadMine}>Download my version</Button>
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
    </div>
  ) : outcome?.kind === "missing" ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">This page is no longer in the content API.</p>
      <Button onClick={downloadMine}>Download my version</Button>
    </div>
  ) : outcome?.kind === "failed" ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">We could not save this page. Your changes are kept as a draft.</p>
      <Button variant="secondary" onClick={() => publish.mutate()}>
        Try again
      </Button>
    </div>
  ) : editing.saving === "failed" ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">We could not save your draft. Your changes are still here.</p>
      <Button variant="secondary" onClick={() => void session.save()}>
        Try again
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      {failure && (
        <div role="alert" className="border-s-4 border-error bg-white px-6 py-3 text-error">
          {failure}
        </div>
      )}
      <PageDraftEditor
        store={session.store}
        active={active}
        readOnly={!!lockedBy}
        saveStatus={saveStatusOf(editing, publish.isPending)}
        tools={
          <>
            <Button onClick={() => setHistoryOpen(true)}>History</Button>
            {changed && (
              <Button
                variant="secondary"
                disabled={blocked || publish.isPending || discard.isPending}
                onClick={() => setDiscarding(true)}
              >
                Discard changes
              </Button>
            )}
            <Button
              variant="accent"
              disabled={
                !changed || !!newer || blocked || publish.isPending || outcome?.kind === "missing"
              }
              onClick={() => publish.mutate()}
            >
              {details.visibility === "public" ? "Publish changes" : "Save"}
            </Button>
          </>
        }
        notice={notice}
        fields={{
          title: details.title,
          lede: details.frontmatter.lede,
          panel: (
            <ApiPageDetails
              details={details}
              change={session.setDetails}
              readOnly={!!lockedBy}
              categories={categories}
              entry={published.parent_id === null}
              publishedAt={published.published_at}
              pathLocked={published.published_at ? "Published pages keep their path." : undefined}
              errors={Object.fromEntries(errors.map((error) => [error.field, error.message]))}
            />
          ),
        }}
      />
      {historyOpen && (
        <PageHistoryDialog
          api={api}
          current={published}
          canRestore={!blocked}
          close={() => setHistoryOpen(false)}
          restore={(version) => {
            session.restore(version);
            setHistoryOpen(false);
          }}
        />
      )}
      {discarding && (
        <WorkspaceDialog
          title="Discard your changes?"
          description="The page goes back to what was last published, and its draft is deleted."
          close={() => setDiscarding(false)}
        >
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setDiscarding(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                setDiscarding(false);
                discard.mutate();
              }}
            >
              Discard changes
            </Button>
          </div>
        </WorkspaceDialog>
      )}
    </>
  );
}
