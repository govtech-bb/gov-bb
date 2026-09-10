import { useCallback, useEffect, useRef, useState } from "react";
export interface UseTableOfContentsActiveIdOptions {
  ids: string[];
  offset?: number;
  /**
   * The scroll container to track. Defaults to the viewport.
   *
   * @default null
   */
  root?: Element | null;
  /**
   * When enabled, the section named by `location.hash` is selected on mount
   * and on `hashchange`, so deep links highlight the right section.
   *
   * @default true
   */
  trackHash?: boolean;
}
export interface UseTableOfContentsActiveIdResult {
  /** The id of the section currently considered active, or `null`. */
  activeId: string | null;
  selectSection: (id: string) => void;
}
/** How long scrolling must be quiet before a selected section unpins. */
const SCROLL_SETTLE_MS = 150;
export function useTableOfContentsActiveId({
  ids,
  offset = 0,
  root = null,
  trackHash = true,
}: UseTableOfContentsActiveIdOptions): UseTableOfContentsActiveIdResult {
  const [activeId, setActiveId] = useState<string | null>(null);
  // While pinned (after selectSection), scrollspy keeps tracking but doesn't
  // overwrite the active id until scrolling settles and it unpins.
  const pinned = useRef(false);
  // `ids` is typically rebuilt every render; key effects on its content.
  // \0 can't appear in a document id, so the round-trip is unambiguous.
  const idsKey = ids.join("\0");
  useEffect(() => {
    const elements = idsKey
      .split("\0")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    // Latest known intersection state per element, since observer callbacks
    // only include entries that changed.
    const intersecting = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersecting.add(entry.target);
          } else {
            intersecting.delete(entry.target);
          }
        }
        // Topmost tracked section in view, in document order. When nothing is
        // in view (e.g. inside a long section body), keep the last active id.
        const first = elements.find((el) => intersecting.has(el));
        if (first && !pinned.current) {
          setActiveId(first.id);
        }
      },
      { root, rootMargin: `-${offset}px 0px 0px 0px` },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [idsKey, offset, root]);
  // Pending unpin work, torn down on unmount and superseded by rapid clicks.
  const settleTimer = useRef<number | undefined>(undefined);
  const cancelPendingUnpin = useRef<(() => void) | null>(null);
  const selectSection = useCallback(
    (id: string) => {
      cancelPendingUnpin.current?.();
      pinned.current = true;
      setActiveId(id);
      // Unpin once scrolling has been quiet for a beat: every scroll event
      // (including the smooth scroll to the target) pushes the deadline back.
      // Works without `scrollend`, which Safari didn't support until 18.2.
      const scrollTarget: EventTarget = root ?? window;
      const armSettleTimer = () => {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(() => {
          cancelPendingUnpin.current?.();
          pinned.current = false;
        }, SCROLL_SETTLE_MS);
      };
      scrollTarget.addEventListener("scroll", armSettleTimer, {
        passive: true,
      });
      cancelPendingUnpin.current = () => {
        window.clearTimeout(settleTimer.current);
        scrollTarget.removeEventListener("scroll", armSettleTimer);
        cancelPendingUnpin.current = null;
      };
      armSettleTimer();
    },
    [root],
  );
  useEffect(() => () => cancelPendingUnpin.current?.(), []);
  // Deep links: select the hash section on mount and whenever the hash
  // changes, but only if it's one of the tracked sections.
  useEffect(() => {
    if (!trackHash) return;
    const knownIds = new Set(idsKey.split("\0"));
    const syncFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id && knownIds.has(id)) selectSection(id);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [trackHash, idsKey, selectSection]);
  return { activeId, selectSection };
}
