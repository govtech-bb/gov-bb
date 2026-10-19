import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { surface, surfaceMotion, type PopupName } from "./surface";

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
  children,
  ...placement
}: ContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        sideOffset={6}
        collisionPadding={8}
        {...placement}
        className="z-50 outline-none"
      >
        <BasePopover.Popup
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
