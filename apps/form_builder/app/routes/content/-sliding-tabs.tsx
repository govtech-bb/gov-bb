import { useLayoutEffect, useRef } from "react";

interface SlidingTabsProps<K extends string> {
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Segmented control whose active block slides between segments instead of
 * jumping. The pill's first position is written without a transition so it
 * never animates in from zero.
 */
export function SlidingTabs<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: SlidingTabsProps<K>) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const painted = useRef(false);

  const moveTo = (animate: boolean) => {
    const bar = barRef.current;
    const pill = pillRef.current;
    const tab = bar?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!bar || !pill || !tab) return;
    if (!animate) {
      const prev = pill.style.transition;
      pill.style.transition = "none";
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
      void pill.offsetWidth;
      pill.style.transition = prev;
    } else {
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
    }
  };

  useLayoutEffect(() => {
    moveTo(painted.current);
    painted.current = true;
  }, [value]);

  useLayoutEffect(() => {
    const onResize = () => moveTo(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      ref={barRef}
      className={`t-tabs cms-tabs ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          className="t-tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pure-CSS tooltip; wrap any trigger. `placement="bottom"` flips it under
 *  the trigger — use it for triggers flush with the top of the viewport,
 *  where the default above-position would clip. */
export function Tip({
  label,
  children,
  placement,
}: {
  label: string;
  children: React.ReactNode;
  placement?: "top" | "bottom";
}) {
  return (
    <span className="t-tt-wrap" data-tt-place={placement}>
      {children}
      <span className="t-tt" role="tooltip">
        {label}
      </span>
    </span>
  );
}
