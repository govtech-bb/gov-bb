import { useState } from "react";
import { Delete02Icon, Rocket01Icon, SparklesIcon } from "hugeicons-react";
import { generateContentPage } from "./-ai";
import { CONTENT_ROOT, VISIBILITY_LEVELS } from "./-lib";
import type { OpenContentPR } from "./-server";
import type { EditorState } from "./-editor-state";
import s from "./-styles.module.css";

/** Error banner with a shake on appear; keyed so a new message replays it. */
export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div key={error} className={`${s.errorBanner} t-input is-error is-shaking`}>
      {error}
    </div>
  );
}

/** Shared modal scaffold; presence/transition state stays with the caller. */
function Modal({
  title,
  cls,
  onClose,
  closeDisabled,
  children,
}: {
  title: string;
  cls: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${s.modalOverlay} t-modal-overlay ${cls}`}
      onClick={() => !closeDisabled && onClose()}
    >
      <div
        className={`${s.modal} t-modal ${cls}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.modalHead}>
          <h2>{title}</h2>
          <button
            type="button"
            className={s.secondaryBtn}
            onClick={onClose}
            disabled={closeDisabled}
          >
            Close
          </button>
        </div>
        <div className={s.modalBody}>{children}</div>
      </div>
    </div>
  );
}

export function DeleteModal({
  cls,
  onClose,
  editPath,
  error,
  isDeleting,
  onDelete,
}: {
  cls: string;
  onClose: () => void;
  editPath: string;
  error: string | null;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Modal title="Remove page" cls={cls} onClose={onClose}>
      <p>
        Open a pull request that removes{" "}
        <code>{editPath.slice(CONTENT_ROOT.length)}</code> from the landing
        site? It’s only gone once the PR is merged.
      </p>
      <ErrorBanner error={error} />
      <div className={s.modalActions}>
        <button
          type="button"
          className={s.dangerBtn}
          onClick={onDelete}
          disabled={isDeleting}
        >
          <Delete02Icon size={15} />
          {isDeleting ? "Opening PR…" : "Deploy removal"}
        </button>
        <button
          type="button"
          className={s.secondaryBtn}
          onClick={onClose}
          disabled={isDeleting}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function DeployModal({
  cls,
  onClose,
  ed,
  baseBranch,
  openPR,
  isPublishing,
  onDeploy,
}: {
  cls: string;
  onClose: () => void;
  ed: EditorState;
  baseBranch: string;
  openPR: OpenContentPR | undefined;
  isPublishing: boolean;
  onDeploy: (prDescription: string) => void;
}) {
  const [prDesc, setPrDesc] = useState("");
  return (
    <Modal
      title={ed.editing ? "Deploy update" : "Deploy page"}
      cls={cls}
      onClose={onClose}
    >
      <dl className={s.deploySummary}>
        <dt>File</dt>
        <dd>
          <code>
            {(ed.fixedPath ?? `${CONTENT_ROOT}${ed.slug}.md`).slice(
              CONTENT_ROOT.length,
            )}
          </code>
        </dd>
        {ed.url && (
          <>
            <dt>URL</dt>
            <dd>
              <code>{ed.url}</code>
            </dd>
          </>
        )}
        <dt>Visibility</dt>
        <dd>
          {VISIBILITY_LEVELS.find((v) => v.value === ed.state.visibility)
            ?.label ?? ed.state.visibility}
        </dd>
        <dt>PR opens against</dt>
        <dd>
          <code>{baseBranch}</code>
        </dd>
      </dl>
      {openPR && (
        <p className={s.modalNote}>
          This page already has open PR{" "}
          <a href={openPR.prUrl} target="_blank" rel="noopener noreferrer">
            #{openPR.prNumber}
          </a>{" "}
          — this deploy will push to it instead of opening a new PR.
        </p>
      )}
      <div className={`${s.field} ${s.subField}`}>
        <label className={s.label} htmlFor="sp-pr-desc">
          PR description (optional)
        </label>
        <textarea
          id="sp-pr-desc"
          className={s.textarea}
          rows={3}
          value={prDesc}
          onChange={(e) => setPrDesc(e.target.value)}
          placeholder="What changed and why?"
        />
      </div>
      <ErrorBanner error={ed.error} />
      <div className={s.modalActions}>
        <button
          type="button"
          className={s.primaryBtn}
          onClick={() => onDeploy(prDesc)}
          disabled={isPublishing}
        >
          <Rocket01Icon size={15} />
          {isPublishing ? "Opening PR…" : "Deploy"}
        </button>
        <button
          type="button"
          className={s.secondaryBtn}
          onClick={onClose}
          disabled={isPublishing}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function AiModal({
  cls,
  onClose,
  pageJson,
  onApply,
}: {
  cls: string;
  onClose: () => void;
  /** The current draft as JSON, sent so "rewrite this" works in place. */
  pageJson: string;
  /** Receives the model's proposed fields; the parent applies them to the draft. */
  onApply: (page: Record<string, unknown>) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);

  const onGenerate = async () => {
    const message = prompt.trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const result = await generateContentPage({
        data: { message, pageJson },
      });
      if (result.page) {
        onApply(result.page);
        onClose();
        setPrompt("");
      } else {
        setReply(result.reply || "The AI didn’t propose any changes.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Generate with AI"
      cls={cls}
      onClose={onClose}
      closeDisabled={busy}
    >
      <p>
        Describe the page you want — the draft’s fields and body are filled in
        for you to review. Nothing is deployed until you do it.
      </p>
      <div className={`${s.field} ${s.subField}`}>
        <label className={s.label} htmlFor="sp-ai-prompt">
          What should this page say?
        </label>
        <textarea
          id="sp-ai-prompt"
          className={s.textarea}
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A start page for renewing a driver's licence — takes about 10 minutes, needs the old licence and a debit card."
          autoFocus
        />
      </div>
      {reply && (
        <p className={s.modalNote} style={{ whiteSpace: "pre-wrap" }}>
          {reply}
        </p>
      )}
      <ErrorBanner error={error} />
      <div className={s.modalActions}>
        <button
          type="button"
          className={s.primaryBtn}
          onClick={() => void onGenerate()}
          disabled={busy || !prompt.trim()}
        >
          <SparklesIcon size={15} />
          {busy ? (
            <span className="t-shimmer" data-text="Generating…">
              Generating…
            </span>
          ) : (
            "Generate"
          )}
        </button>
        <button
          type="button"
          className={s.secondaryBtn}
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
