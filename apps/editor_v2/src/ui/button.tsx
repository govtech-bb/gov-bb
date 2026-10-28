import { CircleNotch } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { touchTarget } from "./surface";
import { link } from "./text-link";

// A rail's buttons: tinted under the pointer and while their menu is open, and pressed in while held, as a Button is
export const blockHandle =
  "grid h-6 cursor-pointer place-items-center rounded-sm transition-colors hover:bg-hover active:shadow-press aria-expanded:bg-hover [&>svg]:text-muted [&>svg]:transition-colors hover:[&>svg]:text-ink aria-expanded:[&>svg]:text-ink";

// The one control scale, shared with Input: 24, 32, 36 and 40px
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

// Held down, each is pressed in with GovBB's inset edge, and looks as it does under the pointer, which a touch screen
// never shows. A trigger whose menu or panel is open keeps the pointer's tint, so it shows what it opened
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

/**
 * Classes for the tool's button, for the odd element that can't be a <Button>. Focus is GovBB's teal halo. Under a
 * coarse pointer it's 44px each way, except as a link, which keeps to the line of text it's in. Disabled, or
 * aria-disabled while it keeps its focus, it fades and the pointer doesn't change it; pending (data-pending) it keeps
 * its colour.
 */
export const button = (size: Size = "sm", variant: ButtonVariant = "ghost") =>
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
  /**
   * Working on what it started, such as a save: a turning circle takes its icon's place and it ignores presses, but it
   * keeps its colour and its focus, where disabling it would grey it out as if the press hadn't worked.
   */
  pending?: boolean;
  /**
   * Its words while pending, such as “Deleting page…”. It's as wide as the wider of its two labels, so nothing beside
   * it moves as the work starts and ends.
   */
  pendingLabel?: ReactNode;
};

type Props = Decoration &
  (
    | (ComponentProps<"button"> & { href?: never; target?: never })
    | (ComponentProps<"a"> & { href: string })
  );

/**
 * The tool's button. A ghost button shows when it's on: pressed, for a toggle, or the current page, in a pager. With
 * `aria-disabled` it can't be used but keeps its focus, such as a Save with nothing to save: it looks disabled and a
 * press does nothing.
 */
export function Button(props: Props) {
  const {
    size,
    variant = "ghost",
    icon,
    iconEnd,
    pending = false,
    pendingLabel,
    className,
    children,
  } = props;

  const solo = children == null && !iconEnd;
  // Turning only when motion is welcome: still, the circle and the words say it's working
  const lead = pending ? <CircleNotch className="motion-safe:animate-spin" /> : icon;

  const pressed =
    variant === "ghost" &&
    (props["aria-pressed"] === true ||
      props["aria-pressed"] === "true" ||
      props["aria-current"] === "page");

  // Both labels in one cell, the one not in use invisible, so the button keeps the width of the wider
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

  const content = (
    <>
      {lead && <i className={cn(iconClass, !solo && "mr-[-0.1em] ml-[-0.15em]")}>{lead}</i>}
      {label}
      {iconEnd && <i className={cn(iconClass, "mr-[-0.15em] ml-[-0.1em]")}>{iconEnd}</i>}
    </>
  );

  const classes = cn(
    button(size, variant),
    solo && "aspect-square px-0",
    pressed && on,
    pending && "cursor-progress",
    className,
  );

  if (props.href !== undefined) {
    const {
      size: _size,
      variant: _variant,
      icon: _icon,
      iconEnd: _iconEnd,
      pending: _pending,
      pendingLabel: _pendingLabel,
      className: _className,
      children: _children,
      ...linkProps
    } = props;

    return (
      <a {...linkProps} className={classes}>
        {content}
      </a>
    );
  }

  const {
    size: _size,
    variant: _variant,
    icon: _icon,
    iconEnd: _iconEnd,
    pending: _pending,
    pendingLabel: _pendingLabel,
    href: _href,
    target: _target,
    className: _className,
    children: _children,
    ...buttonProps
  } = props;

  const unusable =
    pending || buttonProps["aria-disabled"] === true || buttonProps["aria-disabled"] === "true";

  return (
    <button
      type="button"
      className={classes}
      {...buttonProps}
      aria-disabled={pending || buttonProps["aria-disabled"]}
      data-pending={pending || undefined}
      // A press while it's pending or aria-disabled does nothing, a form's submit included
      onClick={unusable ? (event) => event.preventDefault() : buttonProps.onClick}
    >
      {content}
    </button>
  );
}
