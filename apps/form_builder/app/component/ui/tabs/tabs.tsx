import { ListHighlight, AnimatedText } from "../animation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { TabsTab } from "@base-ui/react/tabs";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "../utils/cn";
/** Tabs variant definitions. */
/** Labels for internationalization of Tabs component. */
export interface TabsLabels {
  /** Aria label for the button that scrolls to earlier tabs. @default "Scroll tabs left" */
  scrollStart?: string;
  /** Aria label for the button that scrolls to later tabs. @default "Scroll tabs right" */
  scrollEnd?: string;
}
const DEFAULT_LABELS: Required<TabsLabels> = {
  scrollStart: "Scroll tabs left",
  scrollEnd: "Scroll tabs right",
};
export interface TabsVariantsProps {
  /**
   * Tab style.
   * - `"segmented"` — Pill-shaped indicator on a filled track
   * - `"underline"` — Underline indicator below tab text
   * @default "segmented"
   */
  variant?: "segmented" | "underline";
  /**
   * Tab size.
   * - `"base"` — Default size (h-9, text-base)
   * - `"sm"` — Compact size (h-6.5, text-xs) — matches Input size="sm"
   * @default "base"
   */
  size?: "base" | "sm";
}
/** Configuration for a single tab within the Tabs component. */
export type TabsItem = {
  id?: string;
  disabled?: boolean;
  "aria-controls"?: string;
  /** Unique identifier for the tab, used as the controlled value. */
  value: string;
  /** Display content for the tab trigger. */
  label: ReactNode;
  /** Additional CSS classes for this tab trigger. */
  className?: string;
  /**
   * Custom render function or element to replace the tab element (e.g. for link-based tabs).
   * When using a function, it receives the props to spread on the element and the tab's state.
   */
  render?: TabsTab.Props["render"];
  /**
   * Whether the rendered tab is a native button. Set to `false` when `render` produces a non-button element, such as a link.
   * @default true
   */
  nativeButton?: TabsTab.Props["nativeButton"];
};
export type TabsProps = TabsVariantsProps & {
  "aria-label"?: string;
  /** Array of tab items to render. */
  tabs?: TabsItem[];
  /** Controlled value. When set, component becomes controlled. */
  value?: string;
  /** Default selected value for uncontrolled mode. Ignored when `value` is set. */
  selectedValue?: string;
  /** Callback fired when the active tab changes. */
  onValueChange?: (value: string) => void;
  /**
   * When `true`, tabs are activated immediately upon receiving focus via arrow keys.
   * When `false` (default), tabs receive focus but require Enter/Space to activate.
   */
  activateOnFocus?: boolean;
  /** Additional CSS classes for the root element. */
  className?: string;
  /** Additional CSS classes for the tab list element. */
  listClassName?: string;
  /** Additional CSS classes for the indicator element. */
  indicatorClassName?: string;
  /** Labels for internationalization of aria-labels. All labels have English defaults. */
  labels?: TabsLabels;
};
export function Tabs({
  "aria-label": ariaLabel,
  tabs,
  value,
  selectedValue,
  onValueChange,
  activateOnFocus,
  className,
  listClassName,
  indicatorClassName,
  labels: labelsProp,
  variant = "segmented",
  size = "base",
}: TabsProps) {
  const items: TabsItem[] = tabs ?? [];
  const fallbackValue = items[0]?.value;
  const isControlled = value !== undefined;
  const rootProps = {
    value: isControlled ? value : undefined,
    defaultValue: isControlled ? undefined : (selectedValue ?? fallbackValue),
  };
  const isSegmented = variant === "segmented";
  const isUnderline = variant === "underline";
  const isSm = size === "sm";
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const overflowWatchKey = items.map((item) => item.value).join("|");
  const {
    ref: listRef,
    isOverflowing,
    canScrollStart,
    canScrollEnd,
  } = useOverflowDetect(true, overflowWatchKey);
  const bindDrag = useHorizontalDragScroll(listRef, isOverflowing);
  if (items.length === 0) return null;
  return (
    <TabsPrimitive.Root
      {...rootProps}
      className={cn(
        "relative isolate min-w-0 font-medium",
        isSegmented &&
          (isSm ? "rounded-md" : "rounded-lg") + " ring ring-ui-hairline/70",
        className,
      )}
      onValueChange={(nextValue) => {
        const stringValue = String(nextValue);
        onValueChange?.(stringValue);
      }}
    >
      {/* Background element for segmented variant */}
      {isSegmented && (
        <div
          className={cn(
            "absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 rounded-lg bg-ui-recessed",
            isSm ? "h-6.5" : "h-9",
          )}
        />
      )}
      <TabsPrimitive.List
        aria-label={ariaLabel}
        render={
          <ListHighlight
            itemSelector="[role=tab]"
            axis="x"
            hoverBehavior="tabs"
          />
        }
        ref={listRef}
        activateOnFocus={activateOnFocus}
        data-overflowing={isOverflowing ? "" : undefined}
        data-overflow-start={canScrollStart ? "" : undefined}
        data-overflow-end={canScrollEnd ? "" : undefined}
        {...bindDrag()}
        className={cn(
          "ui-tabs-list relative flex min-w-0 shrink scroll-px-(--scroll-fade-width) items-stretch ui-scroll-native overflow-x-auto overflow-y-hidden [--scroll-fade-width:3rem]",
          isSegmented && "rounded-lg bg-ui-recessed px-0.5",
          isSegmented && (isSm ? "h-6.5 rounded-md" : "h-9"),
          isOverflowing && "cursor-grab active:cursor-grabbing",
          isUnderline && "gap-4 border-b border-ui-hairline pb-2",
          isUnderline && (isSm ? "h-6.5" : "h-7.5"),
          listClassName,
        )}
      >
        {items.map((tab) => (
          <TabsPrimitive.Tab
            key={tab.value}
            id={tab.id}
            disabled={tab.disabled}
            aria-controls={tab["aria-controls"]}
            data-ui-component="Tabs"
            data-ui-part="tab"
            value={tab.value}
            render={tab.render}
            nativeButton={tab.nativeButton}
            onClick={(e) => {
              e.currentTarget.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
                block: "nearest",
                inline: "nearest",
              });
            }}
            className={cn(
              "relative z-2 flex items-center rounded bg-transparent whitespace-nowrap focus:ring-ui-focus/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-brand",
              isOverflowing
                ? "cursor-grab active:cursor-grabbing"
                : "cursor-pointer",
              isSm ? "text-xs" : "text-base",
              isSegmented &&
                "my-0.5 text-ui-subtle hover:text-ui-default focus-visible:ring-inset aria-selected:text-ui-default",
              isSegmented && (isSm ? "rounded-sm px-2" : "rounded-md px-2.5"),
              isUnderline &&
                "text-ui-subtle hover:bg-ui-recessed hover:text-ui-default aria-selected:font-medium aria-selected:text-ui-default aria-selected:hover:bg-ui-recessed",
              isUnderline && (isSm ? "px-1.5 py-2.5" : "px-2 py-3"),
              tab.className,
            )}
          >
            <AnimatedText>{tab.label}</AnimatedText>
          </TabsPrimitive.Tab>
        ))}
        <TabsPrimitive.Indicator
          render={(props) => (
            <div
              {...props}
              className={cn(
                "absolute left-0 z-1",
                "w-(--active-tab-width) translate-x-(--active-tab-left) ui-tab-indicator",
                "data-[rendered=false]:scale-90 data-[rendered=false]:opacity-0",
                isSegmented &&
                  cn(
                    "top-(--active-tab-top) h-(--active-tab-height) bg-ui-base shadow-sm ring ring-ui-hairline",
                    isSm ? "rounded" : "rounded-md",
                  ),
                isUnderline && "bottom-0 h-0.5 bg-ui-brand",
                indicatorClassName,
              )}
            />
          )}
        />
      </TabsPrimitive.List>
      {isSegmented && (
        <>
          <TabsOverflowControl
            side="start"
            visible={canScrollStart}
            variant={variant}
            size={size}
            label={labels.scrollStart}
            onClick={() => scrollTabs(listRef, "start")}
          />
          <TabsOverflowControl
            side="end"
            visible={canScrollEnd}
            variant={variant}
            size={size}
            label={labels.scrollEnd}
            onClick={() => scrollTabs(listRef, "end")}
          />
        </>
      )}
    </TabsPrimitive.Root>
  );
}
function TabsOverflowControl({
  side,
  visible,
  variant,
  size,
  label,
  onClick,
}: {
  side: "start" | "end";
  visible: boolean;
  variant: NonNullable<TabsProps["variant"]>;
  size: NonNullable<TabsProps["size"]>;
  label: string;
  onClick: () => void;
}) {
  const isStart = side === "start";
  const isSegmented = variant === "segmented";
  return (
    <button
      type="button"
      data-ui-component="Tabs"
      data-ui-part="overflow-control"
      data-side={side}
      aria-label={label}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
      className={cn(
        "absolute inset-y-0 z-3 flex items-center border-0 bg-transparent p-0 transition-opacity duration-150 focus:outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ui-brand",
        isStart
          ? "left-0 justify-start bg-linear-to-r"
          : "right-0 justify-end bg-linear-to-l",
        visible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
        isSegmented
          ? "from-ui-tint via-ui-tint/95 to-transparent"
          : "from-ui-base via-ui-base/95 to-transparent",
        isSegmented && (size === "sm" ? "w-8 rounded-md" : "w-10 rounded-lg"),
        !isSegmented && "w-8",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center text-ui-subtle transition-colors hover:text-ui-default",
          size === "sm" ? "size-5" : "size-6",
          isSegmented
            ? size === "sm"
              ? "rounded-sm"
              : "rounded-md"
            : "rounded",
          isStart ? "ml-1" : "mr-1",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="size-3.5"
          aria-hidden="true"
        >
          <path
            d={
              isStart
                ? "M9.25 4.25L5.75 8L9.25 11.75"
                : "M6.75 4.25L10.25 8L6.75 11.75"
            }
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </span>
    </button>
  );
}
function scrollTabs(
  ref: React.RefObject<HTMLElement | null>,
  direction: "start" | "end",
) {
  const el = ref.current;
  if (!el) return;
  const tabEls = Array.from(
    el.querySelectorAll<HTMLElement>('[data-ui-part="tab"]'),
  );
  const distance = getTabsScrollSize(el.clientWidth, tabEls);
  el.scrollBy({
    left: direction === "start" ? -distance : distance,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}
function getTabsScrollSize(containerWidth: number, tabs: HTMLElement[]) {
  let totalWidth = 0;
  for (const tab of tabs) {
    const tabWidth = tab.offsetWidth;
    if (totalWidth + tabWidth > containerWidth) {
      return totalWidth || containerWidth;
    }
    totalWidth += tabWidth;
  }
  return Math.max(80, Math.floor(containerWidth * 0.8));
}
// ─── Horizontal drag-to-scroll ────────────────────────────────────────
/**
 * Enables mouse drag to horizontally scroll the tab list.
 * Touch devices keep native horizontal overflow scrolling and inertia.
 */
function useHorizontalDragScroll(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    scrollLeft: number;
    dragging: boolean;
  } | null>(null);
  const shouldSuppressClick = useRef(false);
  return () => ({
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      const el = ref.current;
      if (!el || !enabled) return;
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        scrollLeft: el.scrollLeft,
        dragging: false,
      };
      shouldSuppressClick.current = false;
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLElement>) => {
      const el = ref.current;
      const state = dragState.current;
      if (!el || !enabled || !state || state.pointerId !== event.pointerId)
        return;
      const movementX = event.clientX - state.startX;
      if (!state.dragging) {
        if (Math.abs(movementX) <= 3) return;
        state.dragging = true;
        shouldSuppressClick.current = true;
        el.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      el.scrollLeft = state.scrollLeft - movementX;
    },
    onPointerUpCapture: (event: PointerEvent<HTMLElement>) => {
      const el = ref.current;
      const state = dragState.current;
      if (!el || !state || state.pointerId !== event.pointerId) return;
      dragState.current = null;
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId);
      }
      if (shouldSuppressClick.current) {
        window.setTimeout(() => {
          shouldSuppressClick.current = false;
        }, 0);
      }
    },
    onPointerCancelCapture: (event: PointerEvent<HTMLElement>) => {
      const el = ref.current;
      const state = dragState.current;
      if (!el || !state || state.pointerId !== event.pointerId) return;
      dragState.current = null;
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId);
      }
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!shouldSuppressClick.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      shouldSuppressClick.current = false;
    },
  });
}
// ─── Overflow detection ───────────────────────────────────────────────
/**
 * Detects whether the element's content overflows horizontally.
 * Returns a ref to attach and a boolean for conditional rendering.
 * The `data-overflowing` attribute drives the scroll-fade CSS.
 */
function useOverflowDetect(enabled: boolean, watchKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowState, setOverflowState] = useState({
    isOverflowing: false,
    canScrollStart: false,
    canScrollEnd: false,
  });
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    setOverflowState((prevState) => getNextOverflowState(el, prevState));
  }, [enabled, watchKey]);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setOverflowState((prevState) => getNextOverflowState(el, prevState));
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, [enabled, watchKey]);
  return { ref, ...overflowState };
}
function getNextOverflowState(
  el: HTMLElement,
  prevState: {
    isOverflowing: boolean;
    canScrollStart: boolean;
    canScrollEnd: boolean;
  },
) {
  const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
  const scrollLeft = Math.min(Math.max(0, el.scrollLeft), maxScrollLeft);
  const nextState = {
    isOverflowing: maxScrollLeft > 1,
    canScrollStart: scrollLeft > 1,
    canScrollEnd: maxScrollLeft - scrollLeft > 1,
  };
  return prevState.isOverflowing === nextState.isOverflowing &&
    prevState.canScrollStart === nextState.canScrollStart &&
    prevState.canScrollEnd === nextState.canScrollEnd
    ? prevState
    : nextState;
}
