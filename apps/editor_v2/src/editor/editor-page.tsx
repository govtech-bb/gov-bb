import {
  errorsByBlock,
  validateDocument,
  type Block,
  type PageDocument,
  type Ref,
  type ValidationError,
} from "@govtech-bb/block-kit";
import { ConflictError, ValidationFailedError } from "@govtech-bb/spike-db";
import {
  useCollections,
  useDocument,
  useDocumentList,
  useRenderData,
  useStore,
} from "@govtech-bb/spike-db/react";
import { Link, useParams } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DocumentEditor } from "./blocknote/document-editor";
import { EditorBlockProvider } from "./blocknote/context";
import { clearDraft, readDraft, writeDraft } from "./drafts";
import { CATEGORY_SLUGS, PageProperties } from "./page-properties";
import { servicesInUse } from "./page-url";

/**
 * How long typing must pause before the draft is cached locally.
 *
 * This timer never touches Postgres. Persisting is an explicit act, so a
 * half-finished edit cannot reach the row the site is serving.
 */
const DRAFT_MS = 600;

export function EditorPage() {
  const { id } = useParams({ from: "/editor/$id" });
  const store = useStore();
  const loaded = useDocument(id);
  const collections = useCollections();
  const allDocuments = useDocumentList();

  /** The draft. `loadedAt` is the updated_at every save is conditioned on. */
  const [draft, setDraft] = useState<PageDocument | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [showJson, setShowJson] = useState(false);
  const [draftCached, setDraftCached] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);

  // Adopt the loaded document once; after that the draft is ours. A live
  // update from another tab surfaces as a conflict on save rather than
  // silently overwriting what is being typed.
  useEffect(() => {
    if (!loaded || draft !== null) return;

    // A cached draft wins over the stored row, because it is the work in
    // progress. `loadedAt` still comes from the row it was based on, so if
    // someone else has since written, Save surfaces the conflict rather
    // than quietly overwriting them.
    const cached = readDraft(loaded.id);
    if (cached) {
      setDraft(cached.doc);
      setLoadedAt(cached.basedOn ?? loaded.updated_at);
      setDirty(true);
      setDraftCached(true);
      setRestoredDraft(true);
      return;
    }

    setDraft(loaded);
    setLoadedAt(loaded.updated_at);
  }, [loaded, draft]);

  const liveErrors = useMemo(() => {
    if (!draft || !collections) return [];
    return validateDocument(draft, {
      collections,
      pageUrls: [draft.url],
      // Rule 8 needs every page url, which this component does not hold;
      // the store re-validates with the full set on save.
    }).filter((error) => error.rule !== 8);
  }, [draft, collections]);

  const shown = errors.length > 0 ? errors : liveErrors;
  const grouped = useMemo(() => errorsByBlock(shown), [shown]);
  const errorsFor = useCallback(
    (blockId: string) => grouped.get(blockId) ?? [],
    [grouped],
  );

  const renderData = useRenderData(draft);

  // The store, reachable from the page. `validation.spec.ts` uses it to
  // push a block type the palette does not offer straight at the store, and
  // assert it is refused there too rather than only being absent from the
  // slash menu.
  useEffect(() => {
    (window as unknown as { __spikeStore: unknown }).__spikeStore = store;
  }, [store]);

  /**
   * The save itself. Kept in a ref so the debounce timer always calls the
   * current one without resetting on every keystroke.
   */
  const saveRef = useRef<() => Promise<void>>(async () => {});
  saveRef.current = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setErrors([]);
    setConflict(false);
    try {
      const saved = await store.save(draft, loadedAt);
      // The version has to advance here, or the next save collides with
      // this one — see conflict.spec.ts.
      setDraft(saved);
      setLoadedAt(saved.updated_at);
      setDirty(false);
      // The work is in Postgres now; the local copy would only go stale.
      clearDraft(saved.id);
      setDraftCached(false);
      setRestoredDraft(false);
    } catch (error) {
      if (error instanceof ValidationFailedError) setErrors(error.errors);
      else if (error instanceof ConflictError) setConflict(true);
      else throw error;
    } finally {
      setSaving(false);
    }
  };

  const flush = useCallback(() => {
    void saveRef.current();
  }, []);

  // Debounced autosave — to localStorage, never to the database. Typing is
  // protected against a closed tab; publishing stays a decision.
  useEffect(() => {
    if (!draft || !dirty) return;
    const timer = setTimeout(() => {
      setDraftCached(writeDraft(draft.id, draft, loadedAt));
    }, DRAFT_MS);
    return () => clearTimeout(timer);
  }, [draft, dirty, loadedAt]);

  const onBlocksChange = useCallback(
    (blocks: Block[], refs: Record<string, Ref>) => {
      setDraft((current) =>
        current
          ? { ...current, body: { ...current.body, blocks, refs } }
          : current,
      );
      setDirty(true);
      setErrors([]);
    },
    [],
  );

  const updateEnvelope = (patch: Partial<PageDocument>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
    setDraftCached(false);
    setErrors([]);
  };

  const blockContext = useMemo(
    () => ({
      collections: collections ?? [],
      data: renderData.data,
      refs: draft?.body.refs ?? {},
      refKeys: Object.keys(draft?.body.refs ?? {}),
      loading: renderData.loading,
      errorsFor,
    }),
    [
      collections,
      renderData.data,
      renderData.loading,
      draft?.body.refs,
      errorsFor,
    ],
  );

  if (loaded === undefined || collections === undefined) {
    return <p className="ed-page">Loading…</p>;
  }
  if (loaded === null) {
    return (
      <div className="ed-page">
        <h1>No such page</h1>
        <Link to="/editor">Back to the list</Link>
      </div>
    );
  }
  if (!draft) return <p className="ed-page">Loading…</p>;

  // "Saved" means one thing only: it is in Postgres. Anything a local draft
  // is holding still reads as unsaved, because the site is not serving it.
  const status = saving
    ? "Saving…"
    : dirty
      ? draftCached
        ? "Unsaved changes · draft kept in this browser"
        : "Unsaved changes"
      : "Saved";

  const reload = () => {
    if (draft) clearDraft(draft.id);
    setDraft(null);
    setLoadedAt(null);
    setConflict(false);
    setDirty(false);
    setDraftCached(false);
    setRestoredDraft(false);
    setErrors([]);
  };

  return (
    <EditorBlockProvider value={blockContext}>
      <div className="ed-doc">
        <header className="ed-toolbar">
          <Link to="/editor" className="ed-back">
            ← Pages
          </Link>
          <span className="ed-status" data-testid="save-status">
            {status}
          </span>
          <button
            type="button"
            className="ed-primary"
            data-testid="save"
            onClick={flush}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="ed-secondary"
            data-testid="doc-json-toggle"
            aria-expanded={showJson}
            onClick={() => setShowJson((value) => !value)}
          >
            Document JSON
          </button>
          <a
            className="ed-secondary"
            href={draft.url}
            target="_blank"
            rel="noreferrer"
          >
            View on the site
          </a>
        </header>

        {restoredDraft && !conflict ? (
          <div className="ed-alert ed-alert-draft" data-testid="draft-notice">
            <strong>Unsaved changes were restored from this browser.</strong>
            <p>
              They are not on the site yet. Choose <em>Save</em> to publish
              them, or discard them to go back to the stored version.
            </p>
            <button
              type="button"
              className="ed-secondary"
              data-testid="discard-draft"
              onClick={reload}
            >
              Discard local changes
            </button>
          </div>
        ) : null}

        {conflict ? (
          <div
            className="ed-alert ed-alert-conflict"
            data-testid="conflict-notice"
          >
            <strong>This page changed somewhere else.</strong>
            <p>
              The save was refused because <code>updated_at</code> no longer
              matches the value loaded — nothing was overwritten.
            </p>
            <button type="button" className="ed-secondary" onClick={reload}>
              Discard my changes and reload
            </button>
          </div>
        ) : null}

        {shown.length > 0 ? (
          <div
            className="ed-alert ed-alert-errors"
            data-testid="error-summary"
            role="alert"
          >
            <strong>
              {shown.length} problem{shown.length === 1 ? "" : "s"} must be
              fixed before this can be saved
            </strong>
            <ul>
              {shown.map((error, index) => (
                <li key={index}>
                  <a
                    href={`#block-${error.blockId ?? "document"}`}
                    data-testid={`error-link-${error.blockId ?? "document"}`}
                    onClick={(event) => {
                      if (!error.blockId) return;
                      event.preventDefault();
                      const target = document.querySelector<HTMLElement>(
                        `[data-id="${error.blockId}"]`,
                      );
                      target?.focus();
                      target?.scrollIntoView({ block: "center" });
                    }}
                  >
                    Rule {error.rule}
                  </a>{" "}
                  — {error.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showJson ? (
          <pre className="ed-json" data-testid="doc-json">
            {JSON.stringify(draft.body, null, 2)}
          </pre>
        ) : null}

        {/*
          The title is the page's h1. It reads as the document's own heading
          rather than as a labelled form field — Notion's treatment — while
          still writing straight to `content_pages.title`.
        */}
        <PageTitle
          value={draft.title}
          onChange={(title) => updateEnvelope({ title })}
        />

        <PageProperties
          url={draft.url}
          description={draft.description}
          services={servicesInUse(
            (allDocuments ?? []).map((entry) => entry.url),
            CATEGORY_SLUGS,
          )}
          urlsInUse={(allDocuments ?? [])
            .filter((entry) => entry.id !== draft.id)
            .map((entry) => entry.url)}
          onUrlChange={(url) => updateEnvelope({ url })}
          onDescriptionChange={(description) => updateEnvelope({ description })}
        />

        <DocumentEditor
          blocks={draft.body.blocks}
          refs={draft.body.refs}
          onChange={onBlocksChange}
          onRequestSave={flush}
        />
      </div>
    </EditorBlockProvider>
  );
}

/**
 * The page's h1.
 *
 * A textarea rather than an input, because a title wraps — several of these
 * pages have titles that do not fit one line, and an input would scroll them
 * out of sight instead. It grows to its content so it never scrolls at all.
 */
function PageTitle({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={field}
      className="ed-doc-title"
      data-testid="document-title"
      aria-label="Page title"
      placeholder="Untitled page"
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      // Enter belongs to the document, not to the title.
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
      }}
    />
  );
}
