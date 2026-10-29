import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import { createContext, type KeyboardEvent } from "react";
import { cn } from "../cn";

/** Buttons join the nearest toolbar. Portaled dialogs and popovers reset this to keep their controls separate. */
export const InToolbar = createContext(false);

/** The rule between one group of a toolbar's controls and the next: 20px, in the line's grey. Bar.Separator is one. */
export const toolbarRule = "mx-2 h-5 w-px shrink-0 bg-line";

// Base UI's toolbar leaves Home and End to the browser, so here they go to the first control and the last. A text field
// keeps them for its caret
function toEnd(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Home" && event.key !== "End") return;

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    return;

  // Its controls carry the roving tab index; a nested toolbar's are its own, and focus guards aren't controls
  const toolbar = event.currentTarget;

  const controls = [
    ...toolbar.querySelectorAll<HTMLElement>(
      "[tabindex]:not(:disabled, [data-base-ui-focus-guard])",
    ),
  ].filter((control) => control.closest('[role="toolbar"]') === toolbar);

  const control = event.key === "Home" ? controls[0] : controls.at(-1);

  if (!control) return;
  event.preventDefault();
  control.focus();
}

type RootProps = Omit<BaseToolbar.Root.Props, "aria-label" | "className"> & {
  /** Names it for screen readers, such as “Page tools” or “Text formatting”. */
  label: string;
  className?: string;
};

/** One tab stop with arrow, Home and End navigation. Buttons register automatically; other controls use Toolbar.Button. */
function ToolbarRoot({ label, className, onKeyDown, ...props }: RootProps) {
  return (
    <InToolbar value>
      <BaseToolbar.Root
        {...props}
        aria-label={label}
        className={cn("flex items-center", className)}
        onKeyDown={(event) => {
          toEnd(event);
          onKeyDown?.(event);
        }}
      />
    </InToolbar>
  );
}

/** Registers a non-Button control, such as a select trigger, in the toolbar's keyboard navigation. */
function ToolbarButton(
  props: Omit<BaseToolbar.Button.Props, "render"> & {
    render: NonNullable<BaseToolbar.Button.Props["render"]>;
  },
) {
  // A Button it renders is this control, rather than one more inside it
  return (
    <InToolbar value={false}>
      <BaseToolbar.Button {...props} />
    </InToolbar>
  );
}

/** Rules off one group of controls from the next, as a screen reader hears too. */
function ToolbarSeparator({ className }: { className?: string }) {
  return <BaseToolbar.Separator className={cn(toolbarRule, className)} />;
}

/** Keyboard-navigable control groups. A labelled Bar uses the same toolbar behavior. */
export const Toolbar = {
  Root: ToolbarRoot,
  Button: ToolbarButton,
  Separator: ToolbarSeparator,
};
