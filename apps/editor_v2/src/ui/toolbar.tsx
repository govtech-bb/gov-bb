import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import { createContext, type KeyboardEvent } from "react";
import { cn } from "../cn";

/**
 * Whether a Button is one of a toolbar's controls, which the toolbar's arrow keys move between. The popups its controls
 * open set it back to false: the buttons in them are the popup's, not the toolbar's.
 */
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

/**
 * A row of controls named as one, such as a document's tools: one Tab stop, the arrow keys moving between its controls,
 * and Home and End to its first and last. Every Button in it is one of its controls; a control that isn't a Button
 * joins through Toolbar.Button's `render`.
 */
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

/**
 * Makes a control that isn't a Button one of the toolbar's, such as a select's trigger: `render` it. A Button is one
 * already, with nothing round it.
 */
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

/** Controls that belong together, such as undo and redo, named for screen readers by an `aria-label`. */
function ToolbarGroup({ className, ...props }: BaseToolbar.Group.Props & { className?: string }) {
  return <BaseToolbar.Group {...props} className={cn("flex items-center gap-1", className)} />;
}

/** Rules off one group of controls from the next, as a screen reader hears too. */
function ToolbarSeparator({ className }: { className?: string }) {
  return <BaseToolbar.Separator className={cn(toolbarRule, className)} />;
}

/**
 * The tool's toolbars, on Base UI's Toolbar: a Root with its label, Buttons in it, Groups of them, ruled off by
 * Separators. A labelled Bar is one.
 */
export const Toolbar = {
  Root: ToolbarRoot,
  Button: ToolbarButton,
  Group: ToolbarGroup,
  Separator: ToolbarSeparator,
};
