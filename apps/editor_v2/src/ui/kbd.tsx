import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * A key, or keys pressed together, as a keycap: in a menu row, a tooltip or a hint beside the canvas. It takes the
 * text already written for the platform, such as the editor's shortcut() gives (⌘⇧H on a Mac, Ctrl+Shift+H
 * elsewhere); keys pressed one after another are a Kbd each. Its edge is the colour of the text around it, so it
 * reads on white, on a highlighted row and in a dark tooltip alike.
 */
export function Kbd({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-xs border border-current/40 px-1 font-sans text-12 leading-none font-semibold whitespace-nowrap not-italic",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
