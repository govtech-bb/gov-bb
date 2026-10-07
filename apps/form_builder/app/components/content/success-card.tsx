import { CheckmarkCircle02Icon } from "hugeicons-react";
import { Elevated } from "../ui/surface";
import { Button } from "../ui/button";
import type { DeploySuccess } from "./use-editor-state";

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
    <div className="flex flex-1 items-start justify-center bg-ui-recessed px-6 py-12">
      <Elevated
        offset={1}
        shadowLevel={2}
        render={<div />}
        className="w-full max-w-155 rounded-xl p-7 [&_h2]:m-0 [&_h2]:mb-3 [&_h2]:text-[18px] [&_p]:m-0 [&_p]:mb-2.5 [&_p]:leading-[1.55] [&_a]:text-ui-link [&_a]:break-all"
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
          <p className="text-ui-danger" role="status">
            {success.warning}
          </p>
        )}
        <p className="text-ui-subtle">A reviewer must approve and merge it.</p>
        <Button type="button" onClick={onBack} variant="primary" size="sm">
          Back to all pages
        </Button>
      </Elevated>
    </div>
  );
}
