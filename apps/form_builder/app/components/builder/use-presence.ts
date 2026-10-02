import { useEffect, useState } from "react";
import {
  claimPresence,
  releasePresence,
  type PresenceHolder,
} from "../../server/presence";

/**
 * How often the client re-asserts the claim. A single `claimPresence` call does
 * everything we need on a tick:
 *   - if I already hold it → it's a heartbeat (bumps last_activity_at);
 *   - if the claim is free or stale → the atomic conditional upsert takes it
 *     over (I become the holder, editing unlocks);
 *   - if someone else holds it fresh → the upsert is filtered server-side and I
 *     get back `held:false` + the current holder, so I stay read-only.
 * So one cadence covers heartbeat, poll, and handover.
 */
export const PRESENCE_SYNC_MS = 30_000;

export interface PresenceState {
  /** True when a *different* user holds a fresh claim — disable edits/Save/Deploy. */
  isReadOnly: boolean;
  /** The current claim holder (me or someone else), or null when nobody holds it. */
  holder: PresenceHolder | null;
}

/**
 * Editing-presence hook for the builder (read-only lock, #874).
 *
 * Pass the id of the *existing* form being edited (the loaded form). For a
 * brand-new, never-saved form pass `null`: there's no one to conflict with and
 * the API exempts brand-new creation from the lock, so claiming would only
 * churn rows.
 *
 * Claims on mount and whenever `formId` changes, re-syncs on an interval (only
 * while the tab is visible, so an editor who walks away lets the 15-minute TTL
 * lapse), and best-effort releases the claim on unmount / tab close. Returns
 * `{ isReadOnly, holder }`.
 */
export function usePresence(formId: string | null): PresenceState {
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [holder, setHolder] = useState<PresenceHolder | null>(null);

  useEffect(() => {
    if (!formId) {
      setIsReadOnly(false);
      setHolder(null);
      return;
    }
    let active = true;

    const sync = () => {
      // Don't heartbeat a backgrounded tab — that would hold the lock while the
      // editor is elsewhere. The TTL reclaims it; a return to the tab re-claims.
      if (typeof document !== "undefined" && document.hidden) return;
      claimPresence({ data: { formId } })
        .then((result) => {
          if (!active) return;
          setHolder(result.holder);
          setIsReadOnly(!result.held);
        })
        .catch(() => {
          // Transient (network/SSR hiccup); the next tick retries. Don't flip
          // read-only on a failed sync — that would block edits on a blip.
        });
    };

    sync();
    const interval = setInterval(sync, PRESENCE_SYNC_MS);
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) sync();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      active = false;
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      // Best-effort release so the next editor unlocks immediately rather than
      // waiting out the TTL. Safe: the API only deletes the row if it's mine.
      releasePresence({ data: { formId } }).catch(() => {});
    };
  }, [formId]);

  // Best-effort release on tab close. `beforeunload` can't await the request, so
  // the 15-minute TTL is the real guarantee here.
  useEffect(() => {
    if (!formId || typeof window === "undefined") return;
    const onUnload = () => {
      releasePresence({ data: { formId } }).catch(() => {});
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [formId]);

  return { isReadOnly, holder };
}
