import { Collapsible } from "../ui/collapsible";
import { InputArea } from "../ui/input/input-area";
import { Button } from "../ui/button";
import { useState } from "react";
import { Dialog } from "../ui/dialog";
import { Banner } from "../ui/banner";
import { Delete02Icon, Rocket01Icon } from "hugeicons-react";
import { CONTENT_ROOT, VISIBILITY_LEVELS } from "../../lib/content";
import type { OpenContentPR } from "../../server/content";
import type { EditorState } from "./use-editor-state";

function Modal({
  open,
  title,
  onClose,
  onClosed,
  closeDisabled,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onClosed?: () => void;
  closeDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && closeDisabled) {
          details.cancel();
          return;
        }
        if (!next) onClose();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
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
  open,
  onClose,
  editPath,
  error,
  isDeleting,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  editPath: string;
  error: string | null;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Remove page"
      onClose={onClose}
      closeDisabled={isDeleting}
    >
      <p className="wrap-anywhere">
        Request removal of <code>{editPath.slice(CONTENT_ROOT.length)}</code>.
        The page stays available until a reviewer approves and merges the
        removal.
      </p>
      {error && (
        <Banner variant="error" role="alert">
          {error}
        </Banner>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          variant="destructive"
          size="sm"
        >
          <Delete02Icon size={15} />
          {isDeleting ? "Sending…" : "Request removal"}
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
  open,
  onClose,
  ed,
  baseBranch,
  openPR,
  isPublishing,
  onDeploy,
}: {
  open: boolean;
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
      open={open}
      title={openPR ? "Update review" : "Publish page"}
      onClose={onClose}
      onClosed={() => setPrDesc("")}
      closeDisabled={isPublishing}
    >
      <p className="text-sm text-ui-subtle">
        {openPR
          ? "Send your latest changes to the existing review."
          : "Send this page for review. It goes live after approval and publication."}
      </p>
      <dl className="m-0 mb-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px] [&_dt]:text-ui-subtle [&_dd]:m-0 [&_dd]:wrap-anywhere">
        <dt>Page</dt>
        <dd className="font-medium">{ed.state.title || "Untitled page"}</dd>
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
      </dl>
      <Collapsible.Root className="rounded-lg border border-ui-hairline px-4 py-3 text-sm">
        <Collapsible.DefaultTrigger className="cursor-pointer font-medium">
          Publication details
        </Collapsible.DefaultTrigger>
        <Collapsible.Panel keepMounted>
          <p className="mt-3 text-ui-subtle wrap-anywhere">
            Updates{" "}
            <code>
              {(ed.fixedPath ?? `${CONTENT_ROOT}${ed.slug}.md`).slice(
                CONTENT_ROOT.length,
              )}
            </code>{" "}
            on <code>{baseBranch}</code> through a GitHub pull request.
          </p>
        </Collapsible.Panel>
      </Collapsible.Root>
      {openPR && (
        <p className="py-2 text-[13px] text-ui-subtle [&_a]:text-ui-link">
          Continue review{" "}
          <a href={openPR.prUrl} target="_blank" rel="noopener noreferrer">
            #{openPR.prNumber}
          </a>{" "}
          with these changes.
        </p>
      )}
      <div className="mb-4.5 mt-2">
        <label
          className="mb-1.5 block text-[13px] font-medium text-ui-default"
          htmlFor="sp-pr-desc"
        >
          {openPR
            ? "Update note (optional)"
            : "Description for the reviewer (optional)"}
        </label>
        <InputArea
          id="sp-pr-desc"
          data-modal-initial-focus
          rows={3}
          value={prDesc}
          onChange={(e) => setPrDesc(e.target.value)}
          placeholder={
            openPR
              ? "What should the reviewer know about this update?"
              : "What changed and why?"
          }
          className="w-full min-w-0"
        />
      </div>
      {ed.error && (
        <Banner variant="error" role="alert">
          {ed.error}
        </Banner>
      )}
      <div className="mt-3 flex gap-2">
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
              ? "Updating review…"
              : "Sending…"
            : openPR
              ? `Update review #${openPR.prNumber}`
              : "Send for review"}
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
