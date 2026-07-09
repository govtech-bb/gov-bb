import { useLayoutEffect, useRef } from "react";

const REORDER_MS = 250;
const FLASH_MS = 1500;
// A clearly-visible --accent (#0b5cab) tint that fades to transparent —
// direction-neutral, so it reads as "this row just changed" whether it was
// enabled or disabled. Held solid briefly, then faded, so it's obvious even
// while the row slides to its new sorted position.
const FLASH_FROM = "rgba(11, 92, 171, 0.45)";
const FLASH_TO = "rgba(11, 92, 171, 0)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function canAnimate(el: HTMLElement | undefined): el is HTMLElement {
  // jsdom (tests) has no Web Animations API — guard so it no-ops there.
  return !!el && typeof el.animate === "function";
}

/**
 * FLIP row-reorder + change-flash for the services table, driven by the Web
 * Animations API (no dependency).
 *
 * - `register(slug)` returns a ref callback each `<tr>` must attach; rows must be
 *   keyed by the same slug so React reuses the DOM node across reorders.
 * - Pass an `orderKey` that changes whenever the visible order changes; the hook
 *   re-measures and slides any row that moved (FLIP: measure new positions,
 *   invert to the old position, play back to zero).
 * - `flash(slug)` briefly highlights a row's background — call it when a change
 *   is applied to that row.
 *
 * Reorder movement respects `prefers-reduced-motion`; the flash is a colour fade
 * (not vestibular motion) and always runs.
 */
export function useRowAnimations(orderKey: string) {
  const rows = useRef(new Map<string, HTMLElement>());
  const prevTops = useRef(new Map<string, number>());

  const register = (slug: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(slug, el);
    else rows.current.delete(slug);
  };

  useLayoutEffect(() => {
    // Read phase first: settled positions of every registered row, taken before
    // any animate() call so a mid-flight transform can't corrupt the measurement.
    const tops = new Map<string, number>();
    rows.current.forEach((el, slug) => {
      tops.set(slug, el.getBoundingClientRect().top);
    });

    if (!prefersReducedMotion()) {
      rows.current.forEach((el, slug) => {
        const prev = prevTops.current.get(slug);
        const next = tops.get(slug);
        if (prev != null && next != null && prev !== next && canAnimate(el)) {
          el.animate(
            [
              { transform: `translateY(${prev - next}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: REORDER_MS, easing: "ease" },
          );
        }
      });
    }
    prevTops.current = tops;
  }, [orderKey]);

  function flash(slug: string) {
    const el = rows.current.get(slug);
    if (!canAnimate(el)) return;
    el.animate(
      [
        { backgroundColor: FLASH_FROM, offset: 0 },
        { backgroundColor: FLASH_FROM, offset: 0.2 },
        { backgroundColor: FLASH_TO, offset: 1 },
      ],
      { duration: FLASH_MS, easing: "ease-out" },
    );
  }

  return { register, flash };
}
