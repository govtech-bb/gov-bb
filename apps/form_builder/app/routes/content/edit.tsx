import { ScrollArea } from "../../components/ui/scroll-area";
import { Loader } from "../../components/ui/loader";
import { Banner } from "../../components/ui/banner";
import { Badge } from "../../components/ui/badge";
import { AppLink } from "../../components/app-link";
import { useConfirmation } from "../../components/ui/dialog/confirmation";
import { Button } from "../../components/ui/button";
import type { AssistantRequest } from "../../components/ui/ai/prompt-bar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft02Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  Moon02Icon,
  Rocket01Icon,
  SparklesIcon,
  Sun03Icon,
  ViewIcon,
  ViewOffIcon,
} from "hugeicons-react";
import { listForms } from "../../server/forms";
import { getPublishBaseBranch } from "../../server/publish";
import { publishStartPage, deleteContentPage } from "./-server";
import { HeaderMenu, type HeaderMenuItem } from "./-header-menu";
import { linkableForms, buildDeployPayload } from "./-lib";
import { StartPagePreviewFrame, LANDING_ORIGIN } from "./-preview-frame";
import { useContentList } from "./-use-content-list";
import { usePersistedState } from "./-use-persisted";
import { SlidingTabs, Tip } from "./-sliding-tabs";
import { useTheme } from "./-use-theme";
import {
  useEditorState,
  type EditSearch,
  type EditorState,
} from "./-editor-state";
import { PageFields } from "./-fields";
import { ContentAssistant } from "../../components/ui/ai/content-assistant";
import { DeleteModal, DeployModal, ErrorBanner } from "./-modals";
import { SuccessCard } from "./-success-card";
import type { BuilderFormSummary } from "../../types/index";
import s from "./-styles.module.css";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const Route = createFileRoute("/content/edit")({
  validateSearch: (search): EditSearch => ({
    path: typeof search.path === "string" ? search.path : undefined,
    formId: typeof search.formId === "string" ? search.formId : undefined,
    kind:
      search.kind === "entry" || search.kind === "start"
        ? search.kind
        : undefined,
  }),
  loader: async () => {
    const [forms, baseBranch] = await Promise.all([
      // Hide disabled draft-only / orphan-override rows the picker uses for
      // re-enable (#1658) — they have no live recipe to link content to.
      listForms()
        .then(linkableForms)
        .catch(() => []),
      getPublishBaseBranch().catch(() => "dev"),
    ]);
    return { forms, baseBranch };
  },
  component: StartPagesEditor,
});

const BREAKPOINTS = [
  { key: "desktop", label: "Desktop", width: "100%" },
  { key: "tablet", label: "Tablet", width: "820px" },
  { key: "mobile", label: "Mobile", width: "390px" },
] as const;

type Breakpoint = (typeof BREAKPOINTS)[number]["key"];

// The doc-header overflow menu's entries, gated by editor mode. Kept out of the
// component so its conditional assembly doesn't inflate StartPagesEditor.
function buildHeaderMenuItems(deps: {
  success: boolean;
  showPreview: boolean;
  onTogglePreview: () => void;
  editing: boolean;
  deleteAllowed: boolean;
  url: string;
  theme: string;
  onToggleTheme: () => void;
  dirty: boolean;
  onDiscardDraft: () => void;
  onDeletePage: () => void;
  confirm: ReturnType<typeof useConfirmation>;
}): HeaderMenuItem[] {
  const {
    success,
    showPreview,
    onTogglePreview,
    editing,
    deleteAllowed,
    url,
    theme,
    onToggleTheme,
    dirty,
    onDiscardDraft,
    onDeletePage,
    confirm,
  } = deps;
  return [
    ...(!success
      ? [
          {
            label: showPreview ? "Hide preview" : "Show preview",
            icon: showPreview ? (
              <ViewOffIcon size={15} />
            ) : (
              <ViewIcon size={15} />
            ),
            onSelect: onTogglePreview,
          },
        ]
      : []),
    ...(editing && url && LANDING_ORIGIN
      ? [
          {
            label: "View live",
            icon: <ArrowUpRight01Icon size={15} />,
            onSelect: () =>
              window.open(
                `${LANDING_ORIGIN}${url}`,
                "_blank",
                "noopener,noreferrer",
              ),
          },
        ]
      : []),
    {
      label: theme === "light" ? "Dark mode" : "Light mode",
      icon:
        theme === "light" ? <Moon02Icon size={15} /> : <Sun03Icon size={15} />,
      onSelect: onToggleTheme,
    },
    ...(dirty && !success
      ? [
          {
            label: "Discard unsaved changes",
            danger: true,
            onSelect: async () => {
              if (
                await confirm({
                  title: "Discard unsaved changes?",
                  description:
                    "Discard your unsaved changes and revert to the saved version?",
                  confirmLabel: "Discard changes",
                  destructive: true,
                })
              )
                onDiscardDraft();
            },
          },
        ]
      : []),
    ...(editing && deleteAllowed && !success
      ? [
          {
            label: "Delete page",
            icon: <Delete02Icon size={15} />,
            danger: true,
            onSelect: onDeletePage,
          },
        ]
      : []),
  ];
}

// The live-preview split pane: device tabs + resizable iframe rendering the
// body exactly as deploy would publish it. Rendered only when preview is shown.
function EditorPreviewPane({
  dragging,
  onStartDrag,
  paneWidth,
  onResize,
  breakpoint,
  onBreakpointChange,
  ed,
}: {
  dragging: boolean;
  onStartDrag: (e: React.MouseEvent) => void;
  paneWidth: number;
  onResize: (nextWidth: number) => void;
  breakpoint: Breakpoint;
  onBreakpointChange: (b: Breakpoint) => void;
  ed: EditorState;
}) {
  const { state } = ed;
  const frameWidth =
    BREAKPOINTS.find((b) => b.key === breakpoint)?.width ?? "100%";
  const onSplitterKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 80 : 20;
    const nextWidth =
      event.key === "ArrowLeft"
        ? paneWidth - step
        : event.key === "ArrowRight"
          ? paneWidth + step
          : event.key === "Home"
            ? 360
            : event.key === "End"
              ? 4096
              : null;
    if (nextWidth === null) return;
    event.preventDefault();
    onResize(nextWidth);
  };
  return (
    <>
      <div
        className={s.splitter}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize editor and preview"
        aria-valuemin={360}
        aria-valuemax={4096}
        aria-valuenow={Math.min(paneWidth, 4096)}
        aria-valuetext={`${paneWidth} pixels`}
        tabIndex={0}
        title="Drag or use arrow keys to resize"
        onMouseDown={onStartDrag}
        onKeyDown={onSplitterKeyDown}
      />

      <div
        className={s.previewPanel}
        // The iframe would swallow mousemove during a drag — disable it.
        style={dragging ? { pointerEvents: "none" } : undefined}
      >
        <div className={s.previewToolbar}>
          <SlidingTabs
            ariaLabel="Preview device"
            options={BREAKPOINTS.map((b) => ({ key: b.key, label: b.label }))}
            value={breakpoint}
            onChange={onBreakpointChange}
          />
          <span className={s.previewUrl}>
            {ed.url ? `…${ed.url}` : "alpha.gov.bb"}
          </span>
        </div>
        <div className={s.previewStage}>
          <div className={s.deviceFrame} style={{ width: frameWidth }}>
            <StartPagePreviewFrame
              data={{
                frontmatter: {
                  title: state.title.trim() || "Untitled service",
                  description: state.description.trim() || undefined,
                  category: state.category,
                  stage: "alpha",
                  visibility: state.visibility,
                  form_id: ed.previewFormId,
                  publish_date: todayIso(),
                },
                body: ed.previewBody,
                path:
                  "/" +
                  [state.category || undefined, ed.slug || undefined]
                    .filter(Boolean)
                    .join("/"),
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function StartPagesEditor() {
  const confirm = useConfirmation();
  const { user } = Route.useRouteContext();
  const { forms, baseBranch } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const contentList = useContentList(true);
  const ed = useEditorState(
    forms,
    search,
    contentList.pages,
    contentList.reviewSnapshot.complete,
  );
  const { state } = ed;
  const editClaims = ed.editPath
    ? (contentList.openPRs.get(ed.editPath) ?? [])
    : [];
  const editRevision = ed.editRevision;
  const activeReview =
    editRevision?.source === "pr" && editClaims.length === 1
      ? editClaims.find(
          (claim) => claim.prNumber === editRevision.prNumber && claim.writable,
        )
      : undefined;

  // Combobox options = the builder's forms ∪ any form referenced by a content
  // page, so the picker is populated even when the forms API is unavailable
  // (e.g. local dev, where the content list reads the local checkout).
  const formOptions = useMemo<BuilderFormSummary[]>(() => {
    const map = new Map<string, BuilderFormSummary>();
    for (const f of forms) map.set(f.formId, f);
    for (const p of contentList.pages ?? []) {
      if (p.formId && !map.has(p.formId)) {
        map.set(p.formId, {
          id: p.formId,
          formId: p.formId,
          title: "",
          version: "",
          isPublished: false,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      (a.title || a.formId).localeCompare(b.title || b.formId),
    );
  }, [forms, contentList.pages]);

  const [breakpoint, setBreakpoint] = usePersistedState<Breakpoint>(
    "content-cms:breakpoint",
    "desktop",
  );
  const [showPreview, setShowPreview] = usePersistedState(
    "content-cms:showPreview",
    true,
  );
  const [paneWidth, setPaneWidth] = usePersistedState(
    "content-cms:paneWidth",
    460,
  );
  const [dragging, setDragging] = useState(false);
  const resizePane = (nextWidth: number) => {
    const max = Math.max(360, Math.round(window.innerWidth * 0.65));
    setPaneWidth(Math.min(Math.max(360, nextWidth), max));
  };
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = paneWidth;
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      resizePane(startW + ev.clientX - startX);
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const [deployOpen, setDeployOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Generate with AI: the model proposes page fields, which are applied to
  // the local draft only — deploying stays a separate, human action.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRequest, setAiRequest] = useState<AssistantRequest>();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const onDeploy = async (prDescription: string) => {
    setIsPublishing(true);
    ed.setError(null);
    ed.setSuccess(null);
    try {
      const result = await publishStartPage({
        data: buildDeployPayload({
          state,
          slug: ed.slug,
          prDescription,
          creatingCategory: ed.creatingCategory,
          newCatSlug: ed.newCatSlug,
          newCatTitle: ed.newCatTitle,
          newCatDesc: ed.newCatDesc,
          editPath: ed.editPath,
          editSha: ed.editSha,
          editRevision: ed.editRevision,
          baseFrontmatter: ed.baseFrontmatter,
          createPath: ed.createPath,
        }),
      });
      if (result.status === "conflict") {
        ed.setDeployConflict(result.conflict);
        ed.setError(result.conflict.message);
        return;
      }
      setDeployOpen(false);
      ed.markSaved();
      ed.setSuccess({ ...result, kind: ed.editing ? "updated" : "added" });
    } catch (e) {
      ed.setError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setIsPublishing(false);
    }
  };

  const onDelete = async () => {
    if (!ed.editPath) return;
    setIsDeleting(true);
    ed.setError(null);
    try {
      const result = await deleteContentPage({
        data: {
          path: ed.editPath,
          title: state.title.trim(),
          expectedRevision: ed.editRevision ?? { source: "absent" },
        },
      });
      setDeleteOpen(false);
      ed.setSuccess({ ...result, kind: "removed" });
    } catch (e) {
      ed.setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const success = ed.success;

  return (
    <div className={s.aiWorkspace}>
      <div className={s.shell}>
        <header className={s.docHeader}>
          <div className={s.headerLeft}>
            <Tip label="All pages">
              <AppLink
                size="sm"
                to="/content"
                variant="secondary"
                aria-label="Back to all pages"
                onClick={async (e) => {
                  if (
                    e.button !== 0 ||
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey
                  )
                    return;
                  e.preventDefault();
                  if (await ed.confirmDiscard())
                    void navigate({ to: "/content" });
                }}
              >
                <ArrowLeft02Icon size={15} />
              </AppLink>
            </Tip>
            <div>
              <div className={s.eyebrow}>{ed.eyebrow}</div>
              <h1 className={s.docTitle}>
                {state.title.trim() || "Untitled service"}
              </h1>
            </div>
          </div>
          <div className={s.headerActions}>
            {ed.dirty && !success && (
              <Badge variant="warning">
                {ed.draftSaved ? "Draft saved" : "Saving…"}
              </Badge>
            )}
            {!success && (
              <Button
                type="button"
                onClick={() => setAiOpen(true)}
                disabled={ed.loadingPage}
                variant="secondary"
                size="sm"
              >
                <SparklesIcon size={15} />
                Assistant
              </Button>
            )}
            <HeaderMenu
              items={buildHeaderMenuItems({
                confirm,
                success: !!success,
                showPreview,
                onTogglePreview: () => setShowPreview((v) => !v),
                editing: ed.editing,
                deleteAllowed:
                  ed.editRevision?.source === "base" && !ed.reviewBlock,
                url: ed.url,
                theme,
                onToggleTheme: toggleTheme,
                dirty: ed.dirty,
                onDiscardDraft: ed.discardDraft,
                onDeletePage: () => setDeleteOpen(true),
              })}
            />
            {!success && !ed.loadingPage && ed.deployBlockReason && (
              <Badge variant="destructive">{ed.deployBlockReason}</Badge>
            )}
            {!success && (
              <Button
                type="button"
                onClick={() => setDeployOpen(true)}
                disabled={!ed.canDeploy || isPublishing || ed.loadingPage}
                variant="primary"
                size="sm"
              >
                <Rocket01Icon size={15} />
                {activeReview
                  ? `Update PR #${activeReview.prNumber}`
                  : ed.editing
                    ? "Deploy update"
                    : "Deploy page"}
              </Button>
            )}
          </div>
        </header>

        {success ? (
          <SuccessCard
            success={success}
            baseBranch={baseBranch}
            onBack={() => navigate({ to: "/content" })}
          />
        ) : (
          <div className={s.body}>
            <ScrollArea
              aria-label="Page fields"
              viewportClassName="scroll-fade"
              className={`${s.fieldsPanel} ${showPreview ? "" : s.fieldsPanelWide}`}
              style={showPreview ? { width: paneWidth } : undefined}
            >
              <div className={s.fieldsContent}>
                <p className={s.hint}>
                  {activeReview
                    ? `Editing PR #${activeReview.prNumber}. Update adds a commit to the same PR.`
                    : ed.editing
                      ? "Editing an existing landing page. Deploy opens a pull request that updates it."
                      : "Deploy opens a pull request that adds this page to the landing site."}{" "}
                  Base: <code>{baseBranch}</code>.
                </p>

                {ed.loadingPage && (
                  <p className={s.modalNote}>
                    <span
                      role="status"
                      className="inline-flex items-center gap-2"
                    >
                      <Loader size={16} aria-hidden />
                      Loading page…
                    </span>
                  </p>
                )}
                {!ed.loadingPage && activeReview && (
                  <p className={s.modalNote}>
                    You’re editing the version in PR{" "}
                    <a
                      href={activeReview.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{activeReview.prNumber}
                    </a>
                    {
                      ", not the live page. Updating adds one commit to that PR."
                    }
                  </p>
                )}
                {ed.reviewBlock && (
                  <Banner variant="error" role="alert">
                    <div className="min-w-0 space-y-2">
                      <span>{ed.reviewBlock.message}</span>
                      <span className={s.reviewLinks}>
                        {ed.reviewBlock.claims.map((claim) => (
                          <a
                            key={`${claim.prNumber}:${claim.path}:${claim.previousPath ?? ""}`}
                            href={claim.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open PR #{claim.prNumber}
                          </a>
                        ))}
                      </span>
                    </div>
                  </Banner>
                )}
                {ed.deployConflict && ed.deployConflict.claims.length > 0 && (
                  <div className={s.reviewLinks}>
                    {ed.deployConflict.claims.map((claim) => (
                      <a
                        key={`${claim.prNumber}:${claim.path}:${claim.previousPath ?? ""}`}
                        href={claim.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Review PR #{claim.prNumber}
                      </a>
                    ))}
                  </div>
                )}
                {ed.deployConflict?.kind === "review-unavailable" && (
                  <Banner variant="error" role="alert">
                    <div className="min-w-0 space-y-2">
                      <span>{ed.deployConflict.message}</span>
                      <Button
                        type="button"
                        onClick={() => {
                          ed.setDeployConflict(null);
                          ed.setError(null);
                          contentList.refetch();
                        }}
                        disabled={contentList.loading}
                        variant="secondary"
                        size="sm"
                      >
                        Retry review check
                      </Button>
                    </div>
                  </Banner>
                )}
                {ed.staleDraft && (
                  <Banner variant="error" role="alert">
                    <div className="min-w-0 space-y-2">
                      <span>
                        {ed.deployConflict
                          ? `${ed.deployConflict.message} `
                          : "This draft is based on an older page revision. "}
                        Your changes are still saved in this browser. Copy
                        anything you need, then load the latest version before
                        deploying.
                      </span>
                      <Button
                        type="button"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Discard unsaved changes?",
                              description:
                                "Discard this saved draft and load the latest page version?",
                              confirmLabel: "Discard changes",
                              destructive: true,
                            })
                          ) {
                            ed.discardDraft();
                            if (ed.editPath) {
                              // Let React remove the beforeunload guard after the
                              // draft is discarded, then request a clean revision.
                              window.setTimeout(
                                () => window.location.reload(),
                                0,
                              );
                            }
                          }
                        }}
                        variant="secondary"
                        size="sm"
                      >
                        Discard draft and load latest
                      </Button>
                    </div>
                  </Banner>
                )}
                <ErrorBanner
                  error={
                    ed.deployConflict?.kind === "review-unavailable" ||
                    ed.staleDraft
                      ? null
                      : ed.error
                  }
                />

                <PageFields
                  ed={ed}
                  formOptions={formOptions}
                  layout={showPreview ? "stacked" : "wide"}
                  onAiAction={
                    ed.loadingPage ||
                    !ed.sourceReady ||
                    ed.reviewBlock ||
                    ed.staleDraft ||
                    ed.deployConflict
                      ? undefined
                      : (request) => {
                          setAiRequest(request);
                          setAiOpen(true);
                        }
                  }
                />
              </div>
            </ScrollArea>

            {showPreview && (
              <EditorPreviewPane
                dragging={dragging}
                onStartDrag={startDrag}
                paneWidth={paneWidth}
                onResize={resizePane}
                breakpoint={breakpoint}
                onBreakpointChange={setBreakpoint}
                ed={ed}
              />
            )}
          </div>
        )}

        {deleteOpen && ed.editPath && (
          <DeleteModal
            onClose={() => setDeleteOpen(false)}
            editPath={ed.editPath}
            error={ed.error}
            isDeleting={isDeleting}
            onDelete={() => void onDelete()}
          />
        )}

        {deployOpen && (
          <DeployModal
            onClose={() => setDeployOpen(false)}
            ed={ed}
            baseBranch={baseBranch}
            openPR={activeReview}
            isPublishing={isPublishing}
            onDeploy={(desc) => void onDeploy(desc)}
          />
        )}
      </div>
      <ContentAssistant
        request={aiRequest}
        onRequestHandled={() => setAiRequest(undefined)}
        user={user.login}
        documentId={ed.editPath ?? "new"}
        state={state}
        fixedPath={!!ed.fixedPath}
        readOnly={
          ed.loadingPage ||
          !ed.sourceReady ||
          !!ed.reviewBlock ||
          ed.staleDraft ||
          !!ed.deployConflict
        }
        open={aiOpen}
        onOpenChange={setAiOpen}
        onApply={ed.setState}
      />
    </div>
  );
}
