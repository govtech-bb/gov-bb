import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import {
  linkableForms,
  applyAiPagePatch,
  buildDeployPayload,
} from "./-lib";
import { StartPagePreviewFrame, LANDING_ORIGIN } from "./-preview-frame";
import { useContentList } from "./-use-content-list";
import { usePersistedState } from "./-use-persisted";
import { useTransitionPresence } from "./-use-transition";
import { SlidingTabs, Tip } from "./-sliding-tabs";
import { useTheme } from "./-use-theme";
import {
  useEditorState,
  type EditSearch,
  type EditorState,
} from "./-editor-state";
import { PageFields } from "./-fields";
import { AiModal, DeleteModal, DeployModal, ErrorBanner } from "./-modals";
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
      listForms().then(linkableForms).catch(() => []),
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
  url: string;
  theme: string;
  onToggleTheme: () => void;
  dirty: boolean;
  onDiscardDraft: () => void;
  onDeletePage: () => void;
}): HeaderMenuItem[] {
  const {
    success,
    showPreview,
    onTogglePreview,
    editing,
    url,
    theme,
    onToggleTheme,
    dirty,
    onDiscardDraft,
    onDeletePage,
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
              window.open(`${LANDING_ORIGIN}${url}`, "_blank", "noopener,noreferrer"),
          },
        ]
      : []),
    {
      label: theme === "light" ? "Dark mode" : "Light mode",
      icon: theme === "light" ? <Moon02Icon size={15} /> : <Sun03Icon size={15} />,
      onSelect: onToggleTheme,
    },
    ...(dirty && !success
      ? [
          {
            label: "Discard unsaved changes",
            danger: true,
            onSelect: () => {
              if (
                window.confirm(
                  "Discard your unsaved changes and revert to the saved version?",
                )
              )
                onDiscardDraft();
            },
          },
        ]
      : []),
    ...(editing && !success
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
  breakpoint,
  onBreakpointChange,
  ed,
}: {
  dragging: boolean;
  onStartDrag: (e: React.MouseEvent) => void;
  breakpoint: Breakpoint;
  onBreakpointChange: (b: Breakpoint) => void;
  ed: EditorState;
}) {
  const { state } = ed;
  const frameWidth =
    BREAKPOINTS.find((b) => b.key === breakpoint)?.width ?? "100%";
  return (
    <>
      <div
        className={s.splitter}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onMouseDown={onStartDrag}
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
  const { forms, baseBranch } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const contentList = useContentList(true);
  const ed = useEditorState(forms, search, contentList.pages);
  const { state } = ed;

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
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = paneWidth;
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const max = Math.round(window.innerWidth * 0.65);
      setPaneWidth(Math.min(Math.max(360, startW + ev.clientX - startX), max));
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const deployModal = useTransitionPresence("--modal-close-dur");
  const deleteModal = useTransitionPresence("--modal-close-dur");
  // Generate with AI: the model proposes page fields, which are applied to
  // the local draft only — deploying stays a separate, human action.
  const aiModal = useTransitionPresence("--modal-close-dur");
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
          baseFrontmatter: ed.baseFrontmatter,
          createPath: ed.createPath,
        }),
      });
      deployModal.close();
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
        data: { path: ed.editPath, title: state.title.trim() },
      });
      deleteModal.close();
      ed.setSuccess({ ...result, kind: "removed" });
    } catch (e) {
      ed.setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const applyAiPage = (page: Record<string, unknown>) => {
    ed.setState((cur) =>
      applyAiPagePatch(cur, page, { fixedPath: !!ed.fixedPath }),
    );
  };

  const success = ed.success;

  return (
    <div className={s.shell}>
      <header className={s.docHeader}>
        <div className={s.headerLeft}>
          <Tip label="All pages">
            <Link
              to="/content"
              className={s.secondaryBtn}
              aria-label="Back to all pages"
              onClick={(e) => {
                if (!ed.confirmDiscard()) e.preventDefault();
              }}
            >
              <ArrowLeft02Icon size={15} />
            </Link>
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
            <span className={s.dirtyHint}>
              {ed.draftSaved ? "Draft saved" : "Saving…"}
            </span>
          )}
          {!success && (
            <button
              type="button"
              className={s.secondaryBtn}
              onClick={() => aiModal.open()}
              disabled={ed.loadingPage}
            >
              <SparklesIcon size={15} />
              Generate with AI
            </button>
          )}
          <HeaderMenu
            items={buildHeaderMenuItems({
              success: !!success,
              showPreview,
              onTogglePreview: () => setShowPreview((v) => !v),
              editing: ed.editing,
              url: ed.url,
              theme,
              onToggleTheme: toggleTheme,
              dirty: ed.dirty,
              onDiscardDraft: ed.discardDraft,
              onDeletePage: () => deleteModal.open(),
            })}
          />
          {!success && !ed.loadingPage && ed.deployBlockReason && (
            <span className={s.deployHint}>{ed.deployBlockReason}</span>
          )}
          {!success && (
            <button
              type="button"
              className={s.primaryBtn}
              onClick={() => deployModal.open()}
              disabled={!ed.canDeploy || isPublishing || ed.loadingPage}
            >
              <Rocket01Icon size={15} />
              {ed.editing ? "Deploy update" : "Deploy page"}
            </button>
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
          <div
            className={`${s.fieldsPanel} ${showPreview ? "" : s.fieldsPanelWide}`}
            style={
              showPreview ? { width: paneWidth, maxWidth: "none" } : undefined
            }
          >
            <p className={s.hint}>
              {ed.editing
                ? "Editing an existing landing page. Deploy opens a pull request that updates it."
                : "Deploy opens a pull request that adds this page to the landing site."}{" "}
              Base: <code>{baseBranch}</code>.
            </p>

            {ed.loadingPage && (
              <p className={s.modalNote}>
                <span className="t-shimmer" data-text="Loading page…">
                  Loading page…
                </span>
              </p>
            )}
            {!ed.loadingPage &&
              ed.editPath &&
              contentList.openPRs.get(ed.editPath) && (
                <p className={s.modalNote}>
                  Showing the version from open PR{" "}
                  <a
                    href={contentList.openPRs.get(ed.editPath)!.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    #{contentList.openPRs.get(ed.editPath)!.prNumber}
                  </a>{" "}
                  (not what's live) — deploying updates that PR.
                </p>
              )}
            <ErrorBanner error={ed.error} />

            <PageFields
              ed={ed}
              formOptions={formOptions}
              layout={showPreview ? "stacked" : "wide"}
            />
          </div>

          {showPreview && (
            <EditorPreviewPane
              dragging={dragging}
              onStartDrag={startDrag}
              breakpoint={breakpoint}
              onBreakpointChange={setBreakpoint}
              ed={ed}
            />
          )}
        </div>
      )}

      {deleteModal.mounted && ed.editPath && (
        <DeleteModal
          cls={deleteModal.cls}
          onClose={() => deleteModal.close()}
          editPath={ed.editPath}
          error={ed.error}
          isDeleting={isDeleting}
          onDelete={() => void onDelete()}
        />
      )}

      {aiModal.mounted && (
        <AiModal
          cls={aiModal.cls}
          onClose={() => aiModal.close()}
          pageJson={JSON.stringify({
            title: state.title,
            description: state.description,
            category: state.category,
            subcategory: state.subcategory,
            slug: ed.slug,
            body: state.body,
            linkType: state.linkType,
            linkHref: state.linkHref,
            visibility: state.visibility,
          })}
          onApply={applyAiPage}
        />
      )}

      {deployModal.mounted && (
        <DeployModal
          cls={deployModal.cls}
          onClose={() => deployModal.close()}
          ed={ed}
          baseBranch={baseBranch}
          openPR={
            ed.editPath ? contentList.openPRs.get(ed.editPath) : undefined
          }
          isPublishing={isPublishing}
          onDeploy={(desc) => void onDeploy(desc)}
        />
      )}
    </div>
  );
}
