import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../cn";

export const TipProvider = Tooltip.Provider;

/**
 * `hint` mutes surrounding text while keeping emphasised shortcut labels bright.
 * The child must forward props and ref to its DOM node for Base UI's render contract.
 */
export function Tip({
  content,
  hint,
  left,
  side = "bottom",
  children,
}: {
  content: ReactNode;
  hint?: boolean;
  left?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Tooltip.Root disableHoverablePopup>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={10} collisionPadding={16} className="z-60">
          <Tooltip.Popup
            className={cn(
              "max-w-[calc(100vw-32px)] rounded-sm bg-ink px-2 py-1 text-12 leading-4 font-semibold transition-opacity duration-200 ease-out data-ending-style:opacity-0 data-instant:transition-none data-starting-style:opacity-0",
              hint ? "text-grey-40 [&_em]:text-white [&_em]:not-italic" : "text-white",
              left ? "text-left" : "text-center",
            )}
          >
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
