import {
  errorsByBlock,
  validateDocument,
  type Block,
  type PageDocument,
  type ValidationError,
} from "@govtech-bb/block-kit";
import { ConflictError, ValidationFailedError } from "@govtech-bb/spike-db";
import {
  useCollections,
  useDocument,
  useRenderData,
  useStore,
} from "@govtech-bb/spike-db/react";
import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentEditor } from "./blocknote/document-editor";
import { EditorBlockProvider } from "./blocknote/context";

/** How long typing must pause before the draft is written. */
const AUTOSAVE_MS = 800;

export function EditorPage() {
  const { id } = useParams({ from: "/editor/$id" });
  const store = useStore();
  const loaded = useDocument(id);
  const collections = useCollections();

  /** The draft. `loadedAt` is the updated_at every save is conditioned on. */
  const [draft, setDraft] = useState<PageDocument | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [showJson, setShowJson] = useState(false);

  // Adopt the loaded document once; after that the draft is ours. A live
  // update from another tab surfaces as a conflict on save rather than
  // silently overwriting what is being typed.
  useEffect(() => {
    if (loaded && draft === null) {
      setDraft(loaded);
      setLoadedAt(loaded.updated_at);
    }
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

  // Debounced autosave. There is no Save button: an editor that looks like
  // Notion gets used as though it saves itself, so it had better.
  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, conflict, draft, flush]);

  const onBlocksChange = useCallback((blocks: Block[]) => {
    setDraft((current) =>
      current ? { ...current, body: { ...current.body, blocks } } : current,
    );
    setDirty(true);
    setErrors([]);
  }, []);

  const updateEnvelope = (patch: Partial<PageDocument>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
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

  const status = saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved";

  const reload = () => {
    setDraft(null);
    setLoadedAt(null);
    setConflict(false);
    setDirty(false);
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

        <div className="ed-envelope">
          <label className="ed-field">
            <span className="ed-field-label">Title</span>
            <input
              className="ed-input ed-title"
              data-testid="document-title"
              value={draft.title}
              onChange={(event) =>
                updateEnvelope({ title: event.target.value })
              }
            />
          </label>
          <label className="ed-field">
            <span className="ed-field-label">URL</span>
            <input
              className="ed-input"
              data-testid="document-url"
              value={draft.url}
              onChange={(event) => updateEnvelope({ url: event.target.value })}
            />
          </label>
        </div>

        <DocumentEditor
          blocks={draft.body.blocks}
          onChange={onBlocksChange}
          onRequestSave={flush}
        />
      </div>
    </EditorBlockProvider>
  );
}
