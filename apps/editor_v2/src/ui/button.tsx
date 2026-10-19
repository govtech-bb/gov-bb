import { CircleNotch } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { touchTarget } from "./surface";
import { link } from "./text-link";

export const blockHandle =
  "grid h-6 cursor-pointer place-items-center rounded-sm transition-colors last:mr-2 hover:bg-hover max-sm:last:mr-0 [&>svg]:text-muted [&>svg]:transition-colors hover:[&>svg]:text-ink";

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

const variants = {
  ghost: "text-muted not-disabled:hover:bg-hover not-disabled:hover:text-ink",
  // GovBB's primary: teal, darker while pressed
  accent: "bg-interactive text-white not-disabled:hover:bg-interactive-active",
  // GovBB's secondary: the neutral grey
  secondary: "bg-line text-ink not-disabled:hover:bg-grey-30",
  // For actions that lose work: the error red, darker while pressed
  danger: "bg-error text-white not-disabled:hover:bg-red-90",
  // A ghost on a dark bar, such as the form's toolbar
  inverse: "text-white not-disabled:hover:bg-white/10",
  // An action that reads as a link, such as going to a problem's line: GovBB's link, in the size of its text
  link: `h-auto justify-start px-0 text-start align-baseline leading-[inherit] font-normal ${link}`,
};

// On: a toggle that's pressed (aria-pressed), or the page you're on in a pager (aria-current). GovBB's selected blue,
// which the pointer doesn't change
const on = "bg-blue-10 text-blue-80 not-disabled:hover:bg-blue-10 not-disabled:hover:text-blue-80";

type Size = keyof typeof sizes;

export type ButtonVariant = keyof typeof variants;

/**
 * Classes for the tool's button, for the odd element that can't be a <Button>. Focus is GovBB's teal halo. Under a
 * coarse pointer it's 44px each way, except as a link, which keeps to the line of text it's in.
 */
export const button = (size: Size = "sm", variant: ButtonVariant = "ghost") =>
  cn(
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm text-center align-middle leading-none font-semibold no-underline outline-offset-2 transition-colors focus-visible:outline-3 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40",
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
   * keeps its colour and its focus, where disabling it would grey it out as if the press hadn't worked. Give it words
   * for the wait too, such as “Deleting page…”.
   */
  pending?: boolean;
};

type Props = Decoration &
  (
    | (ComponentProps<"button"> & { href?: never; target?: never })
    | (ComponentProps<"a"> & { href: string })
  );

/** The tool's button. A ghost button shows when it's on: pressed, for a toggle, or the current page, in a pager. */
export function Button(props: Props) {
  const { size, variant = "ghost", icon, iconEnd, pending = false, className, children } = props;
  const solo = children == null && !iconEnd;
  // Turning only when motion is welcome: still, the circle and the words say it's working
  const lead = pending ? <CircleNotch className="motion-safe:animate-spin" /> : icon;

  const pressed =
    variant === "ghost" &&
    (props["aria-pressed"] === true ||
      props["aria-pressed"] === "true" ||
      props["aria-current"] === "page");

  const content = (
    <>
      {lead && <i className={cn(iconClass, !solo && "mr-[-0.1em] ml-[-0.15em]")}>{lead}</i>}
      {children != null && <span>{children}</span>}
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
    href: _href,
    target: _target,
    className: _className,
    children: _children,
    ...buttonProps
  } = props;

  return (
    <button
      type="button"
      className={classes}
      {...buttonProps}
      aria-disabled={pending || buttonProps["aria-disabled"]}
      // A press while pending does nothing, a form's submit included
      onClick={pending ? (event) => event.preventDefault() : buttonProps.onClick}
    >
      {content}
    </button>
  );
}
