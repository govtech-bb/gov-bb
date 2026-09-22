import {
  errorsByBlock,
  RenderDocument,
  validateDocument,
  type Block,
  type BlockType,
  type PageDocument,
  type ValidationError,
} from '@govtech-bb/block-kit'
import {
  ConflictError,
  ValidationFailedError,
} from '@govtech-bb/spike-db'
import {
  useCollections,
  useDocument,
  useRenderData,
  useStore,
} from '@govtech-bb/spike-db/react'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { BlockEditor } from './blocks'
import { BLOCK_LABELS, createBlock, INSERTABLE } from './new-block'

export function EditorPage() {
  const { id } = useParams({ from: '/editor/$id' })
  const store = useStore()
  const loaded = useDocument(id)
  const collections = useCollections()

  /** The draft. `loadedAt` is the updated_at every save is conditioned on. */
  const [draft, setDraft] = useState<PageDocument | null>(null)
  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [errors, setErrors] = useState<ValidationError[]>([])

  // Adopt the loaded document once; after that the draft is ours. A live
  // update from another tab surfaces as a conflict on save rather than
  // silently overwriting what is being typed.
  useEffect(() => {
    if (loaded && draft === null) {
      setDraft(loaded)
      setLoadedAt(loaded.updated_at)
    }
  }, [loaded, draft])

  const dirty = useMemo(
    () =>
      draft !== null &&
      loaded !== null &&
      loaded !== undefined &&
      JSON.stringify(draft) !== JSON.stringify({ ...loaded, updated_at: draft.updated_at }),
    [draft, loaded],
  )

  const liveErrors = useMemo(() => {
    if (!draft || !collections) return []
    return validateDocument(draft, {
      collections,
      pageUrls: [draft.url],
    }).filter(
      // Rule 8 needs every page url, which this component does not hold;
      // the store re-validates with the full set on save.
      (error) => error.rule !== 8,
    )
  }, [draft, collections])

  const shown = errors.length > 0 ? errors : liveErrors
  const grouped = useMemo(() => errorsByBlock(shown), [shown])

  if (loaded === undefined || collections === undefined) {
    return <p className="ed-page">Loading…</p>
  }
  if (loaded === null) {
    return (
      <div className="ed-page">
        <h1>No such page</h1>
        <Link to="/editor">Back to the list</Link>
      </div>
    )
  }
  if (!draft) return <p className="ed-page">Loading…</p>

  const update = (next: PageDocument) => {
    setDraft(next)
    setErrors([])
    setConflict(false)
  }

  const updateBlock = (index: number, block: Block) =>
    update({
      ...draft,
      body: {
        ...draft.body,
        blocks: draft.body.blocks.map((entry, i) => (i === index ? block : entry)),
      },
    })

  const insert = (type: BlockType, at: number) =>
    update({
      ...draft,
      body: {
        ...draft.body,
        blocks: [
          ...draft.body.blocks.slice(0, at),
          createBlock(type),
          ...draft.body.blocks.slice(at),
        ],
      },
    })

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= draft.body.blocks.length) return
    const blocks = [...draft.body.blocks]
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    update({ ...draft, body: { ...draft.body, blocks } })
  }

  const remove = (index: number) =>
    update({
      ...draft,
      body: {
        ...draft.body,
        blocks: draft.body.blocks.filter((_, i) => i !== index),
      },
    })

  const save = async () => {
    setSaving(true)
    setErrors([])
    setConflict(false)
    try {
      const saved = await store.save(draft, loadedAt)
      setDraft(saved)
      setLoadedAt(saved.updated_at)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (error) {
      if (error instanceof ValidationFailedError) setErrors(error.errors)
      else if (error instanceof ConflictError) setConflict(true)
      else throw error
    } finally {
      setSaving(false)
    }
  }

  const reload = () => {
    setDraft(null)
    setLoadedAt(null)
    setConflict(false)
    setErrors([])
  }

  return (
    <div className="ed-editor">
      <div className="ed-pane ed-pane-edit">
        <header className="ed-toolbar">
          <Link to="/editor" className="ed-back">← Pages</Link>
          <span className="ed-status">
            {conflict
              ? 'Conflict'
              : dirty
                ? 'Unsaved changes'
                : savedAt
                  ? `Saved at ${savedAt}`
                  : 'No changes'}
          </span>
          <button
            type="button"
            className="ed-primary"
            onClick={save}
            disabled={saving || shown.length > 0}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <a className="ed-secondary" href={draft.url} target="_blank" rel="noreferrer">
            View on the site
          </a>
        </header>

        {conflict ? (
          <div className="ed-alert ed-alert-conflict">
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
          <div className="ed-alert ed-alert-errors">
            <strong>
              {shown.length} problem{shown.length === 1 ? '' : 's'} must be
              fixed before this can be saved
            </strong>
            <ul>
              {shown.map((error, index) => (
                <li key={index}>
                  <a href={`#block-${error.blockId ?? 'document'}`}>
                    Rule {error.rule}
                  </a>{' '}
                  — {error.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <fieldset className="ed-repeatable">
          <legend>Page</legend>
          <div className="ed-row">
            <label className="ed-field">
              <span className="ed-field-label">Title</span>
              <input
                className="ed-input"
                value={draft.title}
                onChange={(e) => update({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="ed-field">
              <span className="ed-field-label">URL</span>
              <input
                className="ed-input"
                value={draft.url}
                onChange={(e) => update({ ...draft, url: e.target.value })}
              />
            </label>
          </div>
          <label className="ed-field">
            <span className="ed-field-label">Description</span>
            <textarea
              className="ed-input ed-textarea"
              rows={2}
              value={draft.description ?? ''}
              onChange={(e) =>
                update({ ...draft, description: e.target.value || null })
              }
            />
          </label>
        </fieldset>

        <InsertMenu at={0} onInsert={insert} />

        {draft.body.blocks.map((block, index) => {
          const blockErrors = grouped.get(block.id) ?? []
          return (
            <div key={block.id}>
              <section
                id={`block-${block.id}`}
                className={
                  blockErrors.length > 0 ? 'ed-block ed-block-invalid' : 'ed-block'
                }
              >
                <header className="ed-block-head">
                  <span className="ed-block-type">{BLOCK_LABELS[block.type]}</span>
                  <code className="ed-block-id">{block.id}</code>
                  <span className="ed-block-actions">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">↑</button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === draft.body.blocks.length - 1} aria-label="Move down">↓</button>
                    <button type="button" className="ed-danger" onClick={() => remove(index)}>Delete</button>
                  </span>
                </header>

                {blockErrors.length > 0 ? (
                  <ul className="ed-block-errors">
                    {blockErrors.map((error, i) => (
                      <li key={i}>Rule {error.rule} — {error.message}</li>
                    ))}
                  </ul>
                ) : null}

                <BlockEditor
                  block={block}
                  onChange={(next) => updateBlock(index, next)}
                  collections={collections}
                  refKeys={Object.keys(draft.body.refs)}
                />
              </section>
              <InsertMenu at={index + 1} onInsert={insert} />
            </div>
          )
        })}
      </div>

      <Preview doc={draft} />
    </div>
  )
}

/**
 * The insert menu IS the content model made visible. Nine block types, no
 * "insert HTML", no raw-JSON escape hatch, no code block.
 */
function InsertMenu({
  at,
  onInsert,
}: {
  at: number
  onInsert: (type: BlockType, at: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ed-insert">
      {open ? (
        <div className="ed-insert-menu" role="menu">
          {INSERTABLE.map((type) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              onClick={() => {
                onInsert(type, at)
                setOpen(false)
              }}
            >
              {BLOCK_LABELS[type]}
            </button>
          ))}
          <button type="button" className="ed-insert-cancel" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="ed-insert-open" onClick={() => setOpen(true)}>
          + Insert block
        </button>
      )}
    </div>
  )
}

/** The preview pane, so the editor is fully testable before the site exists. */
function Preview({ doc }: { doc: PageDocument }) {
  const { data, loading } = useRenderData(doc)
  const wide = doc.body.blocks.some((block) => block.type === 'finder')
  return (
    <div className="ed-pane ed-pane-preview">
      <header className="ed-preview-head">Preview</header>
      <div className={wide ? 'bk-document bk-wide' : 'bk-document'}>
        <RenderDocument doc={doc} data={data} loading={loading} />
      </div>
    </div>
  )
}
