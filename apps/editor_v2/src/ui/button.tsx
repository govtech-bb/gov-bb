import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

export const blockHandle =
  "grid h-6 cursor-pointer place-items-center rounded-sm transition-colors last:mr-2 hover:bg-hover max-sm:last:mr-0 [&>svg]:text-muted [&>svg]:transition-colors hover:[&>svg]:text-ink";

const sizes = {
  sm: "h-6 gap-[0.35em] rounded-sm px-[0.5em] text-12",
  md: "h-8 gap-[0.5em] rounded-sm px-[0.75em] text-14",
  lg: "h-10 gap-[0.5em] rounded-sm px-[1em] text-16",
};

const variants = {
  ghost: "text-muted not-disabled:hover:bg-hover not-disabled:hover:text-ink",
  // GovBB's primary: teal, darker while pressed
  accent: "bg-interactive text-white not-disabled:hover:bg-interactive-active",
  // GovBB's secondary: the neutral grey
  secondary: "bg-line text-ink not-disabled:hover:bg-grey-30",
};

type Size = keyof typeof sizes;

type Variant = keyof typeof variants;

/** Classes for the tool's button, for the odd element that can't be a <Button>. Focus is GovBB's teal halo. */
export const button = (size: Size = "md", variant: Variant = "ghost") =>
  cn(
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden text-center align-middle leading-none font-semibold no-underline outline-offset-2 transition-colors focus-visible:outline-3 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40",
    sizes[size],
    variants[variant],
  );

const iconClass =
  "inline-flex shrink-0 items-center justify-center not-italic [&>svg]:size-[1.2em]";

type Decoration = {
  size?: Size;
  variant?: Variant;
  /** Leading icon. With no label it gets icon-only margins. */
  icon?: ReactNode;
  iconEnd?: ReactNode;
};

type Props = Decoration &
  (
    | (ComponentProps<"button"> & { href?: never; target?: never })
    | (ComponentProps<"a"> & { href: string })
  );

export function Button(props: Props) {
  const { size, variant, icon, iconEnd, className, children } = props;
  const solo = children == null && !iconEnd;

  const content = (
    <>
      {icon && (
        <i className={cn(iconClass, solo ? "mx-[-0.3em]" : "mr-[-0.1em] ml-[-0.15em]")}>{icon}</i>
      )}
      {children != null && <span>{children}</span>}
      {iconEnd && <i className={cn(iconClass, "mr-[-0.15em] ml-[-0.1em]")}>{iconEnd}</i>}
    </>
  );

  const classes = cn(button(size, variant), className);

  if (props.href !== undefined) {
    const {
      size: _size,
      variant: _variant,
      icon: _icon,
      iconEnd: _iconEnd,
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
    href: _href,
    target: _target,
    className: _className,
    children: _children,
    ...buttonProps
  } = props;

  return (
    <button type="button" className={classes} {...buttonProps}>
      {content}
    </button>
  );
}
