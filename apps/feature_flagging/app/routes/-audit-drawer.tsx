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
      className="drawer-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="drawer"
        role="dialog"
        aria-label={`History for ${title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h2>History</h2>
          <button type="button" className="linklike" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="svc-slug">{slug}</p>

        {error && <p className="row-error">{error}</p>}
        {!error && entries === null && <p className="empty">Loading…</p>}
        {!error && entries?.length === 0 && (
          <p className="empty">No changes recorded yet.</p>
        )}
        {entries && entries.length > 0 && (
          <ul className="audit-list">
            {entries.map((e, i) => (
              <li className="audit-item" key={`${e.changedAt}-${i}`}>
                <div className="when">{formatWhen(e.changedAt)}</div>
                <div className="change">
                  {e.oldState ? STATUS_LABELS[e.oldState] : "—"} →{" "}
                  {STATUS_LABELS[e.newState]}
                </div>
                <div className="who-line">by {e.author}</div>
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
