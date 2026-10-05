import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-xs font-bold text-caption " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-teal-100 disabled-state cursor-pointer";

// `danger` is the one addition to case-management's set: a delete has to
// look unlike the Cancel beside it in a confirmation dialog.
const variants: Record<Variant, string> = {
  primary: "bg-blue-100 text-white-00 hover:bg-blue-00 active:bg-blue-00",
  secondary:
    "bg-white-00 text-blue-100 border border-grey-00 hover:border-blue-100",
  ghost: "bg-transparent text-blue-100 hover:bg-blue-10",
  danger: "bg-red-00 text-white-00 hover:bg-red-00/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-xs",
  md: "h-10 px-s",
};

/** For an anchor that must look like a button, e.g. "View on the site". */
export function buttonClasses(options?: {
  variant?: Variant;
  size?: Size;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className } = options ?? {};
  return cn(base, variants[variant], sizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        {...rest}
        data-variant={variant}
        className={buttonClasses({ variant, size, className })}
      >
        {children}
      </button>
    );
  },
);
