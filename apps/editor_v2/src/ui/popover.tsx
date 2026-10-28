import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { surface, surfaceMotion, type PopupName } from "./surface";

let barHeight: number | null = null;

/** The sticky bar's height in pixels, measured once from `--bar-height`, whatever unit it's written in. */
function stickyBar() {
  if (barHeight === null) {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:var(--bar-height)";
    document.body.append(probe);
    barHeight = probe.offsetHeight;
    probe.remove();
  }

  return barHeight;
}

/**
 * Collision padding for a popup over a document: it keeps clear of the sticky bar above the page, where it would
 * otherwise cover the document's own tools.
 */
export function belowBar() {
  return { top: stickyBar() + 8, right: 8, bottom: 8, left: 8 };
}

type ContentProps = Pick<
  BasePopover.Positioner.Props,
  | "side"
  | "align"
  | "sideOffset"
  | "alignOffset"
  | "anchor"
  | "collisionPadding"
  | "collisionAvoidance"
  | "sticky"
  | "positionMethod"
> &
  Pick<BasePopover.Popup.Props, "initialFocus" | "finalFocus" | "onClick"> &
  PopupName & {
    /** For the popup: its width, or less padding for content that brings its own. */
    className?: string;
    /** Where its portal goes, when not the page's body: such as a typeahead's own anchor, which the editor owns. */
    container?: HTMLElement | null;
    /** A dialog unless said otherwise: `presentation` for a list the focus never enters, such as a typeahead's. */
    role?: "dialog" | "presentation";
    children: ReactNode;
  };

/**
 * The popover in its portal, below its trigger unless placed otherwise. `anchor` places it against something other
 * than the trigger, such as a block or the selected text. Name it with `aria-label`, or with `aria-labelledby` and
 * the id of its Title.
 */
function PopoverContent({
  initialFocus,
  finalFocus,
  onClick,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  className,
  container,
  role,
  children,
  ...placement
}: ContentProps) {
  return (
    <BasePopover.Portal container={container ?? undefined}>
      <BasePopover.Positioner
        sideOffset={6}
        collisionPadding={8}
        {...placement}
        className="z-popup outline-none"
      >
        <BasePopover.Popup
          role={role ?? "dialog"}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          onClick={onClick}
          aria-label={label}
          aria-labelledby={labelledBy}
          className={cn(
            surface,
            surfaceMotion,
            "max-h-(--available-height) max-w-[calc(100vw-2rem)] overflow-y-auto p-3.5",
            className,
          )}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

/** Names the popover when its Content's aria-labelledby is this id. */
function PopoverTitle({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <BasePopover.Title id={id} className={cn("text-14 font-semibold text-ink", className)}>
      {children}
    </BasePopover.Title>
  );
}

function PopoverDescription({ children }: { children: ReactNode }) {
  return (
    <BasePopover.Description className="mt-0.5 text-14 text-pretty text-muted">
      {children}
    </BasePopover.Description>
  );
}

/** The tool's popovers, on Base UI's Popover: Root, Trigger and Close are Base UI's own parts. */
export const Popover = {
  Root: BasePopover.Root,
  Trigger: BasePopover.Trigger,
  Content: PopoverContent,
  Title: PopoverTitle,
  Description: PopoverDescription,
  Close: BasePopover.Close,
};
