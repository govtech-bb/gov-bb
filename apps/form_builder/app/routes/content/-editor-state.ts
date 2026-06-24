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
} from "./-lib";
import type { ContentPageSummary } from "./-server";
import type { FormDefinitionSummary } from "../../types/index";
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

interface FormState {
  formId: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  body: string;
  linkType: StartLinkType;
  linkHref: string;
  visibility: ViewLevel;
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

export interface DeploySuccess {
  prUrl: string;
  prNumber: number;
  path: string;
  kind: "added" | "updated" | "removed";
  updatedExistingPR?: boolean;
}

function catSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function useEditorState(
  forms: FormDefinitionSummary[],
  search: EditSearch,
  contentPages: ContentPageSummary[] | null,
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

  // Overlay any autosaved draft for this target onto the just-loaded baseline,
  // so reopening the editor restores in-progress edits (and `dirty` lights up).
  const applyStoredDraft = () => {
    const draft = readDraft<Partial<FormState>>(draftKey);
    if (draft) setState((cur) => ({ ...cur, ...draft }));
  };

  // Autosave: debounce-persist the draft whenever it diverges from the loaded
  // baseline. Skipped while a page is still loading (no baseline to diff yet).
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loadingPage || !dirty) return;
    setDraftSaved(false);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      writeDraft(draftKey, state);
      setDraftSaved(true);
    }, 400);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [state, dirty, loadingPage, draftKey]);

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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((cur) => ({ ...cur, [key]: value }));

  const markSaved = () => {
    setSavedSnapshot(JSON.stringify(state));
    clearDraft(draftKey);
    setDraftSaved(false);
  };

  // Drop the autosaved draft and revert the editor to the last loaded/saved
  // baseline (the live page, or an empty new page).
  const discardDraft = () => {
    setState(JSON.parse(savedSnapshot) as FormState);
    clearDraft(draftKey);
    setDraftSaved(false);
  };

  const loadPath = async (path: string) => {
    setLoadingPage(true);
    setError(null);
    try {
      const page = await loadLandingContentPage({ data: { path } });
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
      setCreatePath(null);
      setBaseFrontmatter(fm);
      setCreatingCategory(false);
      setNewCatTitle("");
      setNewCatDesc("");
      applyStoredDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load page");
    } finally {
      setLoadingPage(false);
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
    setBaseFrontmatter(null);
    applyStoredDraft();
  };

  const resetNew = () => {
    setState(EMPTY);
    setSavedSnapshot(JSON.stringify(EMPTY));
    setCreatingCategory(false);
    setNewCatTitle("");
    setNewCatDesc("");
    setEditPath(null);
    setEditSha(null);
    setCreatePath(null);
    setBaseFrontmatter(null);
    applyStoredDraft();
  };

  // Initialise from the URL once per distinct search signature.
  const initedRef = useRef<string | null>(null);
  useEffect(() => {
    if (initedRef.current === initKey) return;
    initedRef.current = initKey;
    setError(null);
    setSuccess(null);
    if (search.path) void loadPath(search.path);
    else if (search.formId && search.kind)
      prefillCreate(search.formId, search.kind);
    else resetNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey]);

  const editing = editPath !== null;
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
    !!state.title.trim() &&
    !!state.body.trim() &&
    hrefValid &&
    collision === null &&
    (state.linkType !== "form" || !!state.formId) &&
    (!creatingCategory || !!newCatSlug) &&
    (fixedPath ? true : isValidSlug(slug));

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
    fixedPath,
    slug,
    slugValid,
    subcats,
    hrefValid,
    collision,
    canDeploy,
    formMissing,
    url,
    previewBody,
    previewFormId,
    eyebrow,
  };
}

export type EditorState = ReturnType<typeof useEditorState>;
