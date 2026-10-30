import { mergeProps } from "@base-ui/react/merge-props";
import { Toolbar } from "@base-ui/react/toolbar";
import { useRender } from "@base-ui/react/use-render";
import { CircleNotch } from "@phosphor-icons/react";
import { useContext, type ReactNode } from "react";
import { cn } from "../cn";
import { touchTarget } from "./surface";
import { link } from "./text-link";
import { InToolbar } from "./toolbar";
import { Tip } from "./tooltip";

// A rail's buttons: tinted under the pointer and while their menu is open, and pressed in while held, as a Button is
export const blockHandle =
  "grid h-6 cursor-pointer place-items-center rounded-sm transition-colors hover:bg-hover active:shadow-press aria-expanded:bg-hover [&>svg]:text-muted [&>svg]:transition-colors hover:[&>svg]:text-ink aria-expanded:[&>svg]:text-ink";

// Heights match Input so adjacent controls align.
const sizes = {
  // An icon control in a rail, a chip or a dense row
  xs: "h-6 gap-1 px-1.5 text-12 [&>i>svg]:size-3.5",
  // Toolbars, menus and popovers: the default
  sm: "h-8 gap-1.5 px-2.5 text-14 [&>i>svg]:size-4",
  // Beside a 36px field: dialogs, panels, pages
  md: "h-9 gap-1.5 px-3 text-14 [&>i>svg]:size-4",
  // A page's one main action
  lg: "h-10 gap-2 px-4 text-16 [&>i>svg]:size-4",
};

// Open triggers retain their hover tint; active styles also provide touch feedback.
const variants = {
  ghost:
    "text-muted pressable:hover:bg-hover pressable:hover:text-ink pressable:active:bg-hover pressable:active:text-ink pressable:active:shadow-press aria-expanded:bg-hover aria-expanded:text-ink data-popup-open:bg-hover data-popup-open:text-ink",
  // GovBB's primary: teal, a step darker under the pointer and while pressed
  accent:
    "bg-interactive text-white pressable:hover:bg-interactive-active pressable:active:bg-interactive-active pressable:active:shadow-press",
  // GovBB's secondary: the neutral grey
  secondary:
    "bg-line text-ink pressable:hover:bg-grey-30 pressable:active:bg-grey-30 pressable:active:shadow-press",
  // For actions that lose work: the error red, a step darker under the pointer and while pressed
  danger:
    "bg-error text-white pressable:hover:bg-red-90 pressable:active:bg-red-90 pressable:active:shadow-press",
  // A ghost on a dark bar, such as the form's toolbar
  inverse:
    "text-white pressable:hover:bg-white/10 pressable:active:bg-white/10 pressable:active:shadow-press aria-expanded:bg-white/15 data-popup-open:bg-white/15",
  // An action that reads as a link, such as going to a problem's line: GovBB's link, in the size of its text
  link: `h-auto justify-start px-0 text-start align-baseline leading-[inherit] font-normal ${link}`,
};

// On: a toggle that's pressed (aria-pressed), or the page you're on in a pager (aria-current). GovBB's selected blue,
// which the pointer and a press don't change
const on =
  "bg-blue-10 text-blue-80 pressable:hover:bg-blue-10 pressable:hover:text-blue-80 pressable:active:bg-blue-10 pressable:active:text-blue-80";

type Size = keyof typeof sizes;

export type ButtonVariant = keyof typeof variants;

const button = (size: Size = "sm", variant: ButtonVariant = "ghost") =>
  cn(
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm text-center align-middle leading-none font-semibold no-underline outline-offset-2 transition-colors focus-visible:outline-3 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:not-data-pending:cursor-not-allowed aria-disabled:not-data-pending:opacity-50",
    variant !== "link" && touchTarget,
    sizes[size],
    variants[variant],
  );

const iconClass = "inline-flex shrink-0 items-center justify-center not-italic";

type Decoration = {
  size?: Size;
  variant?: ButtonVariant;
  /** Leading icon. With no label the button is square. */
  icon?: ReactNode;
  iconEnd?: ReactNode;
  /** Blocks activation and shows a spinner without dropping focus or dimming the button. */
  pending?: boolean;
  /** Both labels reserve space, so the button's width stays fixed while pending. */
  pendingLabel?: ReactNode;
};

/** Icon-only tooltips require an accessible label and no visible text. */
type Name =
  | { tip?: false }
  | { tip: true; icon: ReactNode; "aria-label": string; children?: never };

export type ButtonProps = Decoration & useRender.ComponentProps<"button"> & Name;

/**
 * Joins the nearest toolbar's keyboard navigation. Use `aria-disabled` to block activation without losing focus.
 * `render` applies the same behavior to a link or another control.
 */
export function Button({
  size,
  variant = "ghost",
  icon,
  iconEnd,
  pending = false,
  pendingLabel,
  tip,
  render,
  ref,
  className,
  children,
  onClick,
  ...props
}: ButtonProps) {
  const inToolbar = useContext(InToolbar);
  const solo = children == null && !iconEnd;
  const lead = pending ? <CircleNotch className="motion-safe:animate-spin" /> : icon;

  const pressed =
    variant === "ghost" &&
    (props["aria-pressed"] === true ||
      props["aria-pressed"] === "true" ||
      props["aria-current"] === "page");

  const unusable = pending || props["aria-disabled"] === true || props["aria-disabled"] === "true";

  // Hidden labels still contribute to the grid's width.
  const label =
    pendingLabel == null ? (
      children != null && <span>{children}</span>
    ) : (
      <span className="grid">
        <span
          aria-hidden={pending || undefined}
          className={cn("col-start-1 row-start-1", pending && "invisible")}
        >
          {children}
        </span>
        <span
          aria-hidden={!pending || undefined}
          className={cn("col-start-1 row-start-1", !pending && "invisible")}
        >
          {pendingLabel}
        </span>
      </span>
    );

  const element = useRender({
    defaultTagName: "button",
    // Leave the rendered button's type unset so it cannot override type="submit".
    render: inToolbar ? (
      <Toolbar.Button
        render={render ?? <button />}
        disabled={props.disabled}
        focusableWhenDisabled={false}
      />
    ) : (
      render
    ),
    ref,
    props: mergeProps<"button">(
      {
        type: render ? undefined : "button",
        className: cn(
          button(size, variant),
          solo && "aspect-square px-0",
          pressed && on,
          pending && "cursor-progress",
          className,
        ),
      },
      props,
      {
        "aria-disabled": pending || props["aria-disabled"],
        onClick: unusable ? (event) => event.preventDefault() : onClick,
        children: (
          <>
            {lead && <i className={cn(iconClass, !solo && "mr-[-0.1em] ml-[-0.15em]")}>{lead}</i>}
            {label}
            {iconEnd && <i className={cn(iconClass, "mr-[-0.15em] ml-[-0.1em]")}>{iconEnd}</i>}
          </>
        ),
      },
    ),
    state: { pending },
  });

  return tip ? <Tip content={props["aria-label"]}>{element}</Tip> : element;
}
