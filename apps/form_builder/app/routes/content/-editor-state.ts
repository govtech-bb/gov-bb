import { useEffect, useMemo, useRef, useState } from "react";
import { loadLandingContentPage } from "./-server";
import {
  asString,
  CONTENT_ROOT,
  isValidSlug,
  isExternalHref,
  parseStartLink,
  applyStartLink,
  stripStartLinks,
  startPageUrl,
  subcategoriesFor,
  type ViewLevel,
  type StartLinkType,
  type FormState,
} from "./-lib";
import type {
  ContentDeployConflict,
  ContentPageSummary,
  ContentRevision,
  ContentReviewBlock,
} from "./-server";
import type { BuilderFormSummary } from "../../types/index";
import { draftKeyFor, readDraft, writeDraft, clearDraft } from "./-draft-store";

/**
 * All of the page editor's state and derived validation, separated from the
 * editor's markup: the draft fields, edit-vs-create mode, dirty tracking,
 * URL-driven initialisation, and everything `canDeploy` depends on.
 */

export interface EditSearch {
  /** Edit an existing page by repo path. */
  path?: string;
  /** Or create a page for this form… */
  formId?: string;
  /** …of this kind (which sets the target file + a starter body). */
  kind?: "entry" | "start";
}

const EMPTY: FormState = {
  formId: "",
  slug: "",
  title: "",
  description: "",
  category: "",
  subcategory: "",
  body: "",
  linkType: "form",
  linkHref: "",
  visibility: "draft",
};

const ENTRY_TEMPLATE = `This service lets you …

## How to apply

### Apply online

<a data-start-link>Start now</a>`;

const START_TEMPLATE = `## How long does it take?

It shouldn't take longer than 20 minutes.

## What you will need

- a debit or credit card
- an EZPay+ account

<a data-start-link>Start now</a>`;

const BODY_PLACEHOLDER = START_TEMPLATE;

interface StoredEditorDraft {
  version: 2;
  state: FormState;
  revision: ContentRevision;
}

function revisionKey(revision: ContentRevision): string {
  if (revision.source === "absent") return "absent";
  if (revision.source === "base") return `base:${revision.sha}`;
  return `pr:${revision.prNumber}:${revision.branch}:${revision.headSha}:${revision.sha}`;
}

function isStoredEditorDraft(value: unknown): value is StoredEditorDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 2 &&
    typeof (value as { state?: unknown }).state === "object" &&
    (value as { state?: unknown }).state !== null
  );
}

export interface DeploySuccess {
  prUrl: string;
  prNumber: number;
  path: string;
  kind: "added" | "updated" | "removed";
  updatedExistingPR?: boolean;
  warning?: string;
}

function catSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function useEditorState(
  forms: BuilderFormSummary[],
  search: EditSearch,
  contentPages: ContentPageSummary[] | null,
  reviewComplete = true,
) {
  const [state, setState] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<DeploySuccess | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Edit mode (existing page) vs create-at-fixed-path (new entry/start) vs
  // free create (top-level slug). `baseFrontmatter` preserves unmanaged keys.
  const [editPath, setEditPath] = useState<string | null>(null);
  const [editSha, setEditSha] = useState<string | null>(null);
  const [editRevision, setEditRevision] = useState<Exclude<
    ContentRevision,
    { source: "absent" }
  > | null>(null);
  const [reviewBlock, setReviewBlock] = useState<ContentReviewBlock | null>(
    null,
  );
  const [deployConflict, setDeployConflict] =
    useState<ContentDeployConflict | null>(null);
  const [staleDraft, setStaleDraft] = useState(false);
  const [createPath, setCreatePath] = useState<string | null>(null);
  const [baseFrontmatter, setBaseFrontmatter] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Creating a brand-new category alongside this page: the slug is derived
  // from the title and the categories.ts edit ships in the same PR.
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const newCatSlug = catSlug(newCatTitle);

  // Dirty tracking: the serialized state last loaded/saved. Edits diverge from
  // it; leaving the editor while dirty asks for confirmation.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(EMPTY),
  );
  const dirty = JSON.stringify(state) !== savedSnapshot;

  // The autosave target for the page currently in the editor: its repo path,
  // or `formId:kind` for a not-yet-created page, or "" (→ ":") for a free new
  // page. Matches the URL-driven `initKey` used to (re)initialise below.
  const initKey = search.path ?? `${search.formId ?? ""}:${search.kind ?? ""}`;
  const draftKey = draftKeyFor(initKey);

  // Restore only against the revision the draft was based on. A stale draft
  // stays visible but cannot deploy until the author deliberately loads latest.
  const applyStoredDraft = (baseline: FormState, revision: ContentRevision) => {
    const draft = readDraft<StoredEditorDraft | Partial<FormState>>(draftKey);
    if (!draft) return;
    if (isStoredEditorDraft(draft)) {
      setState(draft.state);
      setStaleDraft(revisionKey(draft.revision) !== revisionKey(revision));
      return;
    }
    // Legacy edit drafts have no revision proof. Preserve the text, but block
    // deploy until the author deliberately loads the latest page.
    setState({ ...baseline, ...draft });
    if (revision.source !== "absent") setStaleDraft(true);
  };

  // Autosave: debounce-persist the draft whenever it diverges from the loaded
  // baseline. Skipped while a page is still loading (no baseline to diff yet).
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loadingPage || !dirty) return;
    setDraftSaved(false);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      writeDraft<StoredEditorDraft>(draftKey, {
        version: 2,
        state,
        revision: editRevision ?? { source: "absent" },
      });
      setDraftSaved(true);
    }, 400);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [state, dirty, loadingPage, draftKey, editRevision]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const confirmDiscard = () =>
    !dirty ||
    window.confirm("You have unsaved changes — leave and discard them?");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((cur) => ({ ...cur, [key]: value }));
    if (
      key === "slug" &&
      editRevision === null &&
      deployConflict &&
      deployConflict.kind !== "review-unavailable" &&
      deployConflict.kind !== "missing-revision"
    ) {
      setDeployConflict(null);
      setError(null);
    }
  };

  const recordDeployConflict = (conflict: ContentDeployConflict | null) => {
    setDeployConflict(conflict);
    if (
      conflict &&
      editRevision !== null &&
      conflict.kind !== "review-unavailable" &&
      conflict.kind !== "missing-revision"
    ) {
      setStaleDraft(true);
    }
  };

  const markSaved = () => {
    setSavedSnapshot(JSON.stringify(state));
    clearDraft(draftKey);
    setDraftSaved(false);
    setDeployConflict(null);
    setStaleDraft(false);
  };

  // Drop the autosaved draft and revert the editor to the last loaded/saved
  // baseline (the live page, or an empty new page).
  const discardDraft = () => {
    setState(JSON.parse(savedSnapshot) as FormState);
    clearDraft(draftKey);
    setDraftSaved(false);
    setDeployConflict(null);
    setStaleDraft(false);
  };

  const loadRequestRef = useRef(0);
  const loadPath = async (path: string, requestId: number) => {
    setLoadingPage(true);
    setError(null);
    try {
      const page = await loadLandingContentPage({ data: { path } });
      if (loadRequestRef.current !== requestId) return;
      const fm = page.frontmatter;
      const formId = asString(fm.form_id);
      const link = parseStartLink(page.body);
      let linkType: StartLinkType = "form";
      let linkHref = "";
      if (link?.href) {
        linkType = isExternalHref(link.href) ? "external" : "slug";
        linkHref = link.href;
      } else if (!link && !formId) {
        linkType = "none";
      }
      const loaded: FormState = {
        formId,
        slug: path.slice(CONTENT_ROOT.length).replace(/\.md$/, ""),
        title: asString(fm.title),
        description: asString(fm.description),
        category:
          asString(fm.category) ||
          (Array.isArray(fm.categories) ? asString(fm.categories[0]) : ""),
        subcategory: asString(fm.subcategory),
        body: page.body,
        linkType,
        linkHref,
        visibility: (asString(fm.visibility) as ViewLevel) || "public",
      };
      setState(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
      setEditPath(page.path);
      setEditSha(page.sha);
      setEditRevision(page.revision);
      setReviewBlock(page.reviewBlock ?? null);
      setDeployConflict(null);
      setStaleDraft(false);
      setCreatePath(null);
      setBaseFrontmatter(fm);
      setCreatingCategory(false);
      setNewCatTitle("");
      setNewCatDesc("");
      applyStoredDraft(loaded, page.revision);
    } catch (e) {
      if (loadRequestRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : "Could not load page");
    } finally {
      if (loadRequestRef.current === requestId) setLoadingPage(false);
    }
  };

  const prefillCreate = (formId: string, kind: "entry" | "start") => {
    const form = forms.find((f) => f.formId === formId);
    const leaf = kind === "start" ? "start" : "index";
    const prefilled: FormState = {
      ...EMPTY,
      formId,
      title: form?.title ?? "",
      slug: `${formId}/${leaf}`,
      body: kind === "start" ? START_TEMPLATE : ENTRY_TEMPLATE,
    };
    setState(prefilled);
    setSavedSnapshot(JSON.stringify(prefilled));
    setCreatePath(`${CONTENT_ROOT}${formId}/${leaf}.md`);
    setEditPath(null);
    setEditSha(null);
    setEditRevision(null);
    setReviewBlock(null);
    setDeployConflict(null);
    setStaleDraft(false);
    setBaseFrontmatter(null);
    setLoadingPage(false);
    applyStoredDraft(prefilled, { source: "absent" });
  };

  const resetNew = () => {
    setState(EMPTY);
    setSavedSnapshot(JSON.stringify(EMPTY));
    setCreatingCategory(false);
    setNewCatTitle("");
    setNewCatDesc("");
    setEditPath(null);
    setEditSha(null);
    setEditRevision(null);
    setReviewBlock(null);
    setDeployConflict(null);
    setStaleDraft(false);
    setCreatePath(null);
    setBaseFrontmatter(null);
    setLoadingPage(false);
    applyStoredDraft(EMPTY, { source: "absent" });
  };

  // Initialise from the URL. The request id prevents a slower page response
  // from replacing a newer route after navigation (and prevents updates after
  // unmount); React Strict Mode can safely start a fresh request after cleanup.
  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    setError(null);
    setSuccess(null);
    if (search.path) void loadPath(search.path, requestId);
    else if (search.formId && search.kind)
      prefillCreate(search.formId, search.kind);
    else resetNew();
    return () => {
      if (loadRequestRef.current === requestId) loadRequestRef.current++;
    };
  }, [initKey]);

  const editing = editPath !== null;
  const sourceReady = !search.path || editRevision !== null;
  const fixedPath = editPath ?? createPath;
  const slug = state.slug.trim() || state.formId;
  const slugValid = slug === "" || isValidSlug(slug);
  const subcats = subcategoriesFor(state.category);

  // Start-link target validation: internal paths must be rooted, external
  // links must be full https (or mailto) URLs. Empty = no button, allowed.
  const href = state.linkHref.trim();
  const hrefValid =
    state.linkType === "form" ||
    state.linkType === "none" ||
    !href ||
    (state.linkType === "slug"
      ? /^\/\S*$/.test(href)
      : /^(https:\/\/|mailto:)\S+$/.test(href));

  // Creating a page that collides with an existing one — either the exact
  // file, or the flat-vs-folder variant claiming the same URL (`foo.md` vs
  // `foo/index.md`; landing's registry would let the last one win silently).
  const targetPath = fixedPath ?? (slug ? `${CONTENT_ROOT}${slug}.md` : "");
  const collision = useMemo(() => {
    if (editing || !targetPath) return null;
    const paths = new Set((contentPages ?? []).map((p) => p.path));
    if (paths.size === 0) return null;
    if (paths.has(targetPath)) return "exists" as const;
    const flat = targetPath.replace(/\.md$/, "");
    if (paths.has(`${flat}/index.md`)) return "url" as const;
    if (flat.endsWith("/index") && paths.has(`${flat.slice(0, -6)}.md`)) {
      return "url" as const;
    }
    return null;
  }, [editing, targetPath, contentPages]);

  const canDeploy =
    reviewComplete &&
    sourceReady &&
    !reviewBlock &&
    !deployConflict &&
    !staleDraft &&
    !!state.title.trim() &&
    !!state.body.trim() &&
    hrefValid &&
    collision === null &&
    (state.linkType !== "form" || !!state.formId) &&
    (!creatingCategory || !!newCatSlug) &&
    (fixedPath ? true : isValidSlug(slug));

  // The first unmet `canDeploy` condition, in the same order, so the disabled
  // deploy button can say *why*. Null exactly when `canDeploy` is true.
  const deployBlockReason: string | null = !reviewComplete
    ? "Refresh review status before deploying"
    : !sourceReady
      ? "Load the page before deploying"
      : reviewBlock
        ? reviewBlock.message
        : deployConflict
          ? deployConflict.message
          : staleDraft
            ? "This draft is based on an older page revision"
            : !state.title.trim()
              ? "Add a title"
              : !state.body.trim()
                ? "Add page content"
                : !hrefValid
                  ? "Add a valid Start link"
                  : collision === "exists"
                    ? "A page already exists at this path"
                    : collision !== null
                      ? "Slug collides with an existing page's URL"
                      : state.linkType === "form" && !state.formId
                        ? "Choose the form the Start button opens"
                        : creatingCategory && !newCatSlug
                          ? "Name the new category"
                          : !fixedPath && !isValidSlug(slug)
                            ? "Slug must be kebab-case"
                            : null;

  const formMissing =
    state.linkType === "form" &&
    !!state.formId &&
    forms.length > 0 &&
    !forms.some((f) => f.formId === state.formId);

  const url = state.category && slug ? startPageUrl(state.category, slug) : "";

  // What the preview renders: the body exactly as deploy would publish it —
  // marker stripped for "no button", href/label resolved otherwise. A not-yet-
  // picked form gets a placeholder id so a placed button still shows.
  const previewBody = useMemo(() => {
    const body = state.body || BODY_PLACEHOLDER;
    if (state.linkType === "none") return stripStartLinks(body);
    const label = parseStartLink(body)?.label || "Start now";
    const href = state.linkType === "form" ? "" : state.linkHref.trim();
    const hasTarget = state.linkType === "form" || !!href;
    return applyStartLink(body, { href, label, hasTarget });
  }, [state.body, state.linkType, state.linkHref]);
  const previewFormId =
    state.linkType === "form" ? state.formId || "__preview__" : "";

  const pageKind = (fixedPath ?? "").endsWith("/start.md")
    ? "start page"
    : (fixedPath ?? "").endsWith("/index.md")
      ? "service page"
      : "page";
  const eyebrow = editing
    ? `Editing ${pageKind}`
    : createPath
      ? `New ${pageKind}`
      : "New page";

  return {
    state,
    setState,
    set,
    error,
    setError,
    success,
    setSuccess,
    loadingPage,
    editPath,
    editSha,
    editRevision,
    reviewBlock,
    deployConflict,
    setDeployConflict: recordDeployConflict,
    staleDraft,
    createPath,
    baseFrontmatter,
    creatingCategory,
    setCreatingCategory,
    newCatTitle,
    setNewCatTitle,
    newCatDesc,
    setNewCatDesc,
    newCatSlug,
    dirty,
    draftSaved,
    confirmDiscard,
    markSaved,
    discardDraft,
    editing,
    sourceReady,
    fixedPath,
    slug,
    slugValid,
    subcats,
    hrefValid,
    collision,
    canDeploy,
    deployBlockReason,
    formMissing,
    url,
    previewBody,
    previewFormId,
    eyebrow,
  };
}

export type EditorState = ReturnType<typeof useEditorState>;
