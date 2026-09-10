import { CheckmarkCircle02Icon } from "hugeicons-react";
import { Elevated } from "../../components/ui/surface";
import { Button } from "../../components/ui/button";
import type { DeploySuccess } from "./-editor-state";
import s from "./-styles.module.css";

export function SuccessCard({
  success,
  baseBranch,
  onBack,
}: {
  success: DeploySuccess;
  baseBranch: string;
  onBack: () => void;
}) {
  return (
    <div className={s.successWrap}>
      <Elevated
        offset={1}
        shadowLevel={2}
        render={<div />}
        className={s.successCard}
      >
        <CheckmarkCircle02Icon
          size={40}
          className="text-ui-success"
          aria-hidden
        />
        <h2>
          {success.kind === "removed"
            ? "Removal deployed"
            : success.updatedExistingPR
              ? `PR #${success.prNumber} updated`
              : success.kind === "updated"
                ? "Update deployed"
                : "Page deployed"}
        </h2>
        <p>
          {success.updatedExistingPR ? (
            <>
              Your changes were added to the existing PR. No new PR was opened.
            </>
          ) : (
            <>
              PR <strong>#{success.prNumber}</strong> opened on{" "}
              <code>{baseBranch}</code>, {success.kind}{" "}
              <code>{success.path}</code>.
            </>
          )}
        </p>
        <p>
          <a href={success.prUrl} target="_blank" rel="noopener noreferrer">
            View PR #{success.prNumber}
          </a>
        </p>
        {success.warning && (
          <p className={s.warningText} role="status">
            {success.warning}
          </p>
        )}
        <p className={s.mutedText}>A reviewer must approve and merge it.</p>
        <Button type="button" onClick={onBack} variant="primary" size="sm">
          Back to all pages
        </Button>
      </Elevated>
    </div>
  );
}
