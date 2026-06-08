import type { PresenceHolder } from "../../server/presence";
import styles from "../../styles/builder.module.css";

// Humanise the holder's last activity into a short "active … ago" phrase. The
// banner re-renders on each presence poll, so this stays roughly current.
function activeAgo(lastActivityAt: string): string {
  const then = new Date(lastActivityAt).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  return `${mins} minutes ago`;
}

/**
 * Read-only-lock banner (#874): shown above the builder when a *different* user
 * holds the fresh editing claim on the open form. Names the current editor and
 * explains why editing/Save/Deploy are disabled.
 */
export function PresenceBanner({ holder }: { holder: PresenceHolder }) {
  return (
    <div className={styles.presenceBanner} role="alert">
      ⚠ <strong>{holder.userLogin}</strong> is currently editing this form
      (active {activeAgo(holder.lastActivityAt)}). Your session is{" "}
      <strong>read-only</strong> until their claim expires.
    </div>
  );
}
