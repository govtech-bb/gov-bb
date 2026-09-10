import { InputArea } from "../../component/ui/input/input-area";
import { Button } from "../../component/ui/button";
import { useState } from "react";
import { Dialog } from "../../component/ui/dialog";
import { Banner } from "../../component/ui/banner";
import { Delete02Icon, Rocket01Icon } from "hugeicons-react";
import { CONTENT_ROOT, VISIBILITY_LEVELS } from "./-lib";
import type { OpenContentPR } from "./-server";
import type { EditorState } from "./-editor-state";
import s from "./-styles.module.css";

export function ErrorBanner({ error }: { error: string | null }) {
  return error ? (
    <Banner variant="error" role="alert">
      {error}
    </Banner>
  ) : null;
}

function Modal({
  title,
  onClose,
  closeDisabled,
  children,
}: {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root
      defaultOpen
      onOpenChange={(open, details) => {
        if (!open && closeDisabled) details.cancel();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog size="lg" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close
            render={
              <Button variant="ghost" size="sm" disabled={closeDisabled} />
            }
          >
            Close
          </Dialog.Close>
        </div>
        <div className="space-y-4">{children}</div>
      </Dialog>
    </Dialog.Root>
  );
}

export function DeleteModal({
  onClose,
  editPath,
  error,
  isDeleting,
  onDelete,
}: {
  onClose: () => void;
  editPath: string;
  error: string | null;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Modal title="Remove page" onClose={onClose} closeDisabled={isDeleting}>
      <p>
        Open a pull request that removes{" "}
        <code>{editPath.slice(CONTENT_ROOT.length)}</code> from the landing
        site? It’s only gone once the PR is merged.
      </p>
      <ErrorBanner error={error} />
      <div className={s.modalActions}>
        <Button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          variant="destructive"
          size="sm"
        >
          <Delete02Icon size={15} />
          {isDeleting ? "Opening PR…" : "Deploy removal"}
        </Button>
        <Dialog.Close
          render={
            <Button disabled={isDeleting} variant="secondary" size="sm" />
          }
        >
          Cancel
        </Dialog.Close>
      </div>
    </Modal>
  );
}

export function DeployModal({
  onClose,
  ed,
  baseBranch,
  openPR,
  isPublishing,
  onDeploy,
}: {
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
      title={
        openPR
          ? `Update PR #${openPR.prNumber}`
          : ed.editing
            ? "Deploy update"
            : "Deploy page"
      }
      onClose={onClose}
      closeDisabled={isPublishing}
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
        <dt>{openPR ? "PR targets" : "PR opens against"}</dt>
        <dd>
          <code>{baseBranch}</code>
        </dd>
      </dl>
      {openPR && (
        <p className={s.modalNote}>
          This page is already in review in PR{" "}
          <a href={openPR.prUrl} target="_blank" rel="noopener noreferrer">
            #{openPR.prNumber}
          </a>{" "}
          — this update adds a commit there instead of opening a new PR.
        </p>
      )}
      <div className={`${s.field} ${s.subField}`}>
        <label className={s.label} htmlFor="sp-pr-desc">
          {openPR ? "Update note (optional)" : "PR description (optional)"}
        </label>
        <InputArea
          id="sp-pr-desc"
          data-modal-initial-focus
          rows={3}
          value={prDesc}
          onChange={(e) => setPrDesc(e.target.value)}
          placeholder={
            openPR
              ? "What changed in this update? This will be added as a PR comment."
              : "What changed and why?"
          }
          className="w-full min-w-0"
        />
      </div>
      <ErrorBanner error={ed.error} />
      <div className={s.modalActions}>
        <Button
          type="button"
          onClick={() => onDeploy(prDesc)}
          disabled={isPublishing || !ed.canDeploy}
          variant="primary"
          size="sm"
        >
          <Rocket01Icon size={15} />
          {isPublishing
            ? openPR
              ? "Updating PR…"
              : "Opening PR…"
            : openPR
              ? `Update PR #${openPR.prNumber}`
              : "Deploy"}
        </Button>
        <Dialog.Close
          render={
            <Button disabled={isPublishing} variant="secondary" size="sm" />
          }
        >
          Cancel
        </Dialog.Close>
      </div>
    </Modal>
  );
}
