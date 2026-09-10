import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type Ref,
} from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "../utils/cn";
type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type Axis = "x" | "y" | "xy";
const checkedSelector =
  '[aria-selected="true"], [aria-checked="true"], [data-checked], [data-active="true"]';
/** a containing item wins, otherwise the nearest centre. */
export function pickNearest(
  rects: Rect[],
  point: {
    x: number;
    y: number;
  },
  axis: Axis,
) {
  let nearest = -1;
  let distance = Infinity;
  for (const [index, rect] of rects.entries()) {
    const insideX = point.x >= rect.left && point.x <= rect.left + rect.width;
    const insideY = point.y >= rect.top && point.y <= rect.top + rect.height;
    if ((axis === "y" || insideX) && (axis === "x" || insideY)) return index;
    const dx = axis === "y" ? 0 : point.x - rect.left - rect.width / 2;
    const dy = axis === "x" ? 0 : point.y - rect.top - rect.height / 2;
    const next = Math.hypot(dx, dy);
    if (next < distance) {
      distance = next;
      nearest = index;
    }
  }
  return nearest;
}
function layoutRect(item: HTMLElement, container: HTMLElement): Rect {
  let top = item.offsetTop;
  let left = item.offsetLeft;
  // Layout offsets stay correct while a popup is scaled or a list is scrolled.
  let parent = item.offsetParent as HTMLElement | null;
  while (parent && parent !== container && container.contains(parent)) {
    top += parent.offsetTop + parent.clientTop;
    left += parent.offsetLeft + parent.clientLeft;
    parent = parent.offsetParent as HTMLElement | null;
  }
  return { left, top, width: item.offsetWidth, height: item.offsetHeight };
}
const rectStyle = (rect: Rect | null) =>
  rect
    ? {
        transform: `translate(${rect.left}px, ${rect.top}px)`,
        width: rect.width,
        height: rect.height,
      }
    : { width: 0, height: 0 };
export type ListHighlightProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>;
  render?: useRender.RenderProp;
  itemSelector?: string;
  axis?: Axis;
  selection?: "single";
  decorationTag?: "div" | "li";
  hoverBehavior?: "list" | "tabs";
};
/** React measures the destination; CSS handles travel, interruption, fade and reduced motion. */
export function ListHighlight({
  ref,
  render,
  children,
  className,
  itemSelector = '[role="option"], [role^="menuitem"]',
  axis = "y",
  selection,
  decorationTag: Decoration = "div",
  hoverBehavior = "list",
  ...props
}: ListHighlightProps) {
  const containerRef = useRef<HTMLElement>(null);
  const pointer = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const [layout, setLayout] = useState({
    hover: null as Rect | null,
    selected: null as Rect | null,
    visible: false,
    snap: true,
    snapSelection: true,
  });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    let items: HTMLElement[] = [];
    let hovered: HTMLElement | undefined;
    let lastHovered: HTMLElement | undefined;
    let selected: HTMLElement | undefined;
    const resize = new ResizeObserver(queue);
    function queue() {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          update();
        });
    }
    function update() {
      const next = Array.from(
        container!.querySelectorAll<HTMLElement>(itemSelector),
      ).filter((item) => item.closest("[data-ui-list]") === container);
      items
        .filter((item) => !next.includes(item))
        .forEach((item) => {
          resize.unobserve(item);
          item.removeAttribute("data-ui-item");
        });
      next
        .filter((item) => !items.includes(item))
        .forEach((item) => {
          resize.observe(item);
          item.setAttribute("data-ui-item", "");
        });
      items = next;
      const visible = items.filter(
        (item) =>
          item.offsetHeight > 0 &&
          !item.closest('[hidden], [inert], [aria-hidden="true"]'),
      );
      const enabled = visible.filter(
        (item) =>
          !item.matches(':disabled, [aria-disabled="true"], [data-disabled]') &&
          !item.querySelector(
            ':disabled, [aria-disabled="true"], [data-disabled]',
          ),
      );
      const active = pointer.current
        ? enabled[
            pickNearest(
              enabled.map((item) => item.getBoundingClientRect()),
              pointer.current,
              axis,
            )
          ]
        : document.activeElement?.matches(":focus-visible")
          ? enabled.find(
              (item) =>
                item.hasAttribute("data-highlighted") ||
                item.contains(document.activeElement),
            )
          : undefined;
      const checked = visible.find(
        (item) =>
          item.matches(checkedSelector) || item.querySelector(checkedSelector),
      );
      hovered?.removeAttribute("data-ui-hover-active");
      active?.setAttribute("data-ui-hover-active", "");
      const selectedRect = checked ? layoutRect(checked, container!) : null;
      if (active) lastHovered = active;
      if (lastHovered && !visible.includes(lastHovered))
        lastHovered = undefined;
      // Keep fading highlights aligned when the list resizes after pointer leave.
      const hoverRect = lastHovered
        ? layoutRect(lastHovered, container!)
        : null;
      const sameHovered = active === hovered;
      const sameSelected = !selected || selected === checked;
      setLayout((previous) => {
        const nextHover =
          !active && hoverBehavior === "tabs" ? selectedRect : hoverRect;
        const visible =
          !!active && !(hoverBehavior === "tabs" && active === checked);
        if (
          previous.visible === visible &&
          JSON.stringify(previous.hover) === JSON.stringify(nextHover) &&
          JSON.stringify(previous.selected) === JSON.stringify(selectedRect)
        )
          return previous;
        const nextLayout = {
          hover: nextHover,
          selected: selectedRect,
          visible,
          snap: sameHovered || (!previous.visible && hoverBehavior !== "tabs"),
          snapSelection: sameSelected,
        };
        return nextLayout;
      });
      hovered = active;
      selected = checked;
    }
    function trackKeyboard(event: KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const controlsList = target
        .getAttribute("aria-controls")
        ?.split(/\s+/)
        .some((id) => {
          const controlled = container!.ownerDocument.getElementById(id);
          return (
            controlled === container ||
            controlled?.contains(container!) ||
            container!.contains(controlled)
          );
        });
      if (container!.contains(target) || controlsList) {
        pointer.current = null;
        queue();
      }
    }
    // DOM events keep portalled submenu movement local to its own list.
    function trackPointer(event: MouseEvent) {
      pointer.current = { x: event.clientX, y: event.clientY };
      queue();
    }
    function leavePointer() {
      pointer.current = null;
      queue();
    }
    container.addEventListener("mousemove", trackPointer, true);
    container.addEventListener("mouseleave", leavePointer);
    resize.observe(container);
    const mutations = new MutationObserver(queue);
    mutations.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "disabled",
        "aria-disabled",
        "aria-selected",
        "aria-checked",
        "aria-hidden",
        "data-checked",
        "data-active",
        "data-highlighted",
        "data-disabled",
        "hidden",
        "inert",
      ],
    });
    container.ownerDocument.addEventListener("keydown", trackKeyboard, true);
    container.addEventListener("focusin", queue);
    container.addEventListener("focusout", queue);
    container.addEventListener("scroll", queue, { passive: true });
    queue();
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("mousemove", trackPointer, true);
      container.removeEventListener("mouseleave", leavePointer);
      resize.disconnect();
      mutations.disconnect();
      container.ownerDocument.removeEventListener(
        "keydown",
        trackKeyboard,
        true,
      );
      container.removeEventListener("focusin", queue);
      container.removeEventListener("focusout", queue);
      container.removeEventListener("scroll", queue);
      hovered?.removeAttribute("data-ui-hover-active");
      items.forEach((item) => item.removeAttribute("data-ui-item"));
    };
  }, [itemSelector, axis, hoverBehavior]);
  return useRender({
    render,
    ref: [containerRef, ref ?? null],
    props: mergeProps(
      {
        "data-ui-list": "",
        "data-ui-ready": !!(layout.hover || layout.selected) || undefined,
        "data-ui-selection": selection,
        className: cn("ui-list", className),
      },
      props,
      {
        children: (
          <>
            <Decoration
              aria-hidden="true"
              role="presentation"
              className="ui-list-decoration"
            >
              {selection && (
                <div
                  className="ui-selection"
                  data-snap={layout.snapSelection || undefined}
                  style={{
                    ...rectStyle(layout.selected),
                    opacity: layout.selected ? 1 : 0,
                  }}
                />
              )}
              <div
                data-slot="ui-hover-highlight"
                className="ui-highlight"
                data-snap={layout.snap || undefined}
                data-visible={layout.visible || undefined}
                style={{
                  ...rectStyle(layout.hover),
                  opacity: layout.visible
                    ? hoverBehavior === "tabs"
                      ? 0.4
                      : 1
                    : 0,
                }}
              />
            </Decoration>
            {children}
          </>
        ),
      },
    ),
  });
}
