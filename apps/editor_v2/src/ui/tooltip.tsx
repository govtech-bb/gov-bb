import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../cn";

export const TipProvider = Tooltip.Provider;

/** Shared tooltip classes for React and editor-created DOM nodes. */
export const tipPopup =
  "max-w-[calc(100vw-32px)] rounded-sm bg-ink px-2 py-1 text-12 leading-4 font-semibold text-white";

type Anchor = Tooltip.Positioner.Props["anchor"];

type TipProps = {
  content: ReactNode;
  /** Mutes the words round what's emphasised (`em`) and keys (Kbd), which stay bright. */
  hint?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  /**
   * How it lines up with what it names: centred on it, or from its start edge with its lines starting there too, for
   * a few lines, such as a name over its shortcut.
   */
  align?: "center" | "start";
  /** Not shown, as when the trigger's own words are on screen; the trigger stays as it is. */
  disabled?: boolean;
  /** Shown or hidden by its owner rather than by the pointer, such as while a mark in the text is pointed at. */
  open?: boolean;
} & (
  | {
      /** What it names, which shows it on hover and focus. It must pass its props and ref on to its element. */
      children: ReactElement;
      /** Something to point at other than its trigger. */
      anchor?: Anchor;
    }
  | { children?: never; anchor: Anchor; open: boolean }
);

/**
 * A name or a hint for a control, shown after a moment's hover, or at once on focus. Without a trigger it points at its
 * `anchor` while its owner holds it `open`.
 */
export function Tip({
  content,
  hint,
  side = "bottom",
  align = "center",
  disabled = false,
  open,
  anchor,
  children,
}: TipProps) {
  return (
    <Tooltip.Root disableHoverablePopup disabled={disabled} open={open}>
      {children && <Tooltip.Trigger render={children} />}
      <Tooltip.Portal>
        <Tooltip.Positioner
          side={side}
          align={align}
          anchor={anchor}
          sideOffset={10}
          collisionPadding={8}
          className="z-tooltip"
        >
          <Tooltip.Popup
            className={cn(
              tipPopup,
              "transition-opacity duration-(--duration-popup-in) ease-out-quint data-ending-style:opacity-0 data-ending-style:duration-(--duration-popup-out) data-instant:transition-none data-starting-style:opacity-0",
              hint && "text-grey-40 [&_em]:text-white [&_em]:not-italic [&_kbd]:text-white",
              align === "start" ? "text-start" : "text-center",
            )}
          >
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
