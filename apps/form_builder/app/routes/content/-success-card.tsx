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
      <div className={s.successCard}>
        <span className="t-success-check" data-state="in" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <path
              d="M14 25l7 7 13-14"
              stroke="#1c8a3b"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2>
          {success.kind === "removed"
            ? "Removal deployed"
            : success.kind === "updated"
              ? "Update deployed"
              : "Page deployed"}
        </h2>
        <p>
          {success.updatedExistingPR ? (
            <>
              Pushed to the already-open PR <strong>#{success.prNumber}</strong>{" "}
              for this page — no duplicate PR was created.
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
            {success.prUrl}
          </a>
        </p>
        <p className={s.mutedText}>A reviewer must approve and merge it.</p>
        <button type="button" className={s.primaryBtn} onClick={onBack}>
          Back to all forms
        </button>
      </div>
    </div>
  );
}
