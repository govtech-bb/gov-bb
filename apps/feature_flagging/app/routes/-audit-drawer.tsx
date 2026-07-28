import { useEffect, useState } from "react";
import { getServiceAudit, type AuditEntry } from "../server/service-status";
import { STATUS_LABELS } from "../lib/service-status";

/**
 * Slide-over panel showing a service's status-change history from the api's
 * audit log (GET /service_status/audit).
 */
export function AuditDrawer({
  slug,
  title,
  onClose,
}: {
  slug: string;
  title: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setEntries(null);
    setError(null);
    getServiceAudit({ data: { slug } })
      .then((rows) => {
        if (live) setEntries(rows);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Failed to load history");
      });
    return () => {
      live = false;
    };
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex justify-end bg-black-00/35"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="h-full w-[min(440px,100%)] overflow-y-auto bg-white-00 p-xm shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-label={`History for ${title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-xxs flex items-center justify-between">
          <h2 className="m-0 text-h4 font-bold">History</h2>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-blue-100 underline hover:no-underline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="font-mono text-caption-sm text-mid-grey-00">{slug}</p>

        {error && <p className="text-caption-sm text-red-00">{error}</p>}
        {!error && entries === null && (
          <p className="py-m text-center text-mid-grey-00">Loading…</p>
        )}
        {!error && entries?.length === 0 && (
          <p className="py-m text-center text-mid-grey-00">
            No changes recorded yet.
          </p>
        )}
        {entries && entries.length > 0 && (
          <ul className="m-0 mt-s list-none p-0">
            {entries.map((e, i) => (
              <li
                className="relative border-l-2 border-grey-00 pb-s pl-s"
                key={`${e.changedAt}-${i}`}
              >
                <div className="text-caption-sm text-mid-grey-00">
                  {formatWhen(e.changedAt)}
                </div>
                <div className="my-[2px] font-bold">
                  {e.oldState ? STATUS_LABELS[e.oldState] : "—"} →{" "}
                  {STATUS_LABELS[e.newState]}
                </div>
                <div className="text-caption text-mid-grey-00">by {e.author}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
