import React, { type ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "../utils/cn";
/** Base styles applied to all badge variants. */
const badgeBase =
  "inline-flex w-fit flex-none shrink-0 items-center justify-self-start gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [a:hover_&]:ring [a:hover_&]:ring-current";
/** Badge variant definitions mapping variant names to their Tailwind classes and descriptions. */
const badgeStyles = {
  variant: {
    /** Semantic token badges */
    primary: "bg-ui-contrast text-ui-inverse",
    secondary: "bg-ui-tint text-ui-default",
    error: "bg-ui-danger-tint text-ui-danger",
    warning: "bg-ui-warning-tint text-ui-warning",
    success: "bg-ui-success-tint text-ui-success",
    destructive: "bg-ui-danger text-ui-on-status",
    info: "bg-ui-info-tint text-ui-info",
    beta: "border border-dashed border-ui-brand bg-transparent text-ui-link",
    outline: "border border-ui-tint bg-ui-base text-ui-default",
    /** Other color token variants */
    red: "bg-ui-danger text-ui-on-status",
    green: "bg-ui-success text-ui-on-status",
    neutral: "bg-ui-neutral text-ui-on-status",
    orange: "bg-ui-warning text-ui-on-warning",
    purple: "bg-ui-purple text-ui-on-status",
    teal: "bg-ui-teal text-ui-on-status",
    "teal-subtle": "bg-ui-teal-tint text-ui-teal",
    blue: "bg-ui-info text-ui-on-status",
  },
  appearance: {
    filled: "",
    dot: "gap-1.5 bg-transparent text-ui-default ring ring-ui-hairline",
  },
  dotColor: {
    none: "",
    success: "bg-ui-success",
    warning: "bg-ui-warning",
    error: "bg-ui-danger",
    neutral: "bg-ui-neutral",
  },
} as const;
export type BadgeVariant = keyof typeof badgeStyles.variant;
export type BadgeAppearance = keyof typeof badgeStyles.appearance;
export type BadgeDotColor = keyof typeof badgeStyles.dotColor;
export interface BadgeVariantsProps {
  variant?: BadgeVariant;
  appearance?: BadgeAppearance;
}
export function badgeVariants({
  variant = "primary",
  appearance = "filled",
}: BadgeVariantsProps = {}) {
  const variantClasses =
    badgeStyles.variant[variant] ?? badgeStyles.variant["primary"];
  const appearanceClasses =
    badgeStyles.appearance[appearance] ?? badgeStyles.appearance["filled"];
  return cn(
    badgeBase,
    // The dot appearance overrides background/text colors from the variant,
    // so only apply variant classes when we're not in dot mode.
    appearance === "dot" ? "" : variantClasses,
    appearanceClasses,
  );
}
const renderIconNode = (IconComponent?: Icon | ReactNode) => {
  if (!IconComponent) return null;
  const Component = IconComponent as React.ComponentType<
    Record<string, unknown>
  >;
  const icon = React.isValidElement(IconComponent) ? (
    IconComponent
  ) : (
    <Component />
  );
  return (
    <span className="flex h-lh w-3 shrink-0 items-center justify-center [&>svg]:size-3">
      {icon}
    </span>
  );
};
interface BadgeBaseProps {
  variant?: BadgeVariant;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  /** Content rendered inside the badge. */
  children: ReactNode;
}
interface FilledBadgeProps extends BadgeBaseProps {
  appearance?: "filled";
  /** Icon from `@phosphor-icons/react` or a React element. Rendered before children. */
  icon?: Icon | ReactNode;
}
interface DotBadgeProps extends BadgeBaseProps {
  appearance: "dot";
  /** Dot badges use their status dot instead of an icon. */
  icon?: never;
}
export type BadgeProps = FilledBadgeProps | DotBadgeProps;
export function Badge({
  variant = "primary",
  appearance = "filled",
  className,
  icon,
  children,
}: BadgeProps) {
  // Crash-safe dot-color lookup via resolveVariant — unknown variants fall
  // back to "none" (no dot) instead of throwing.
  const dotColor =
    appearance === "dot"
      ? (badgeStyles.dotColor[variant as keyof typeof badgeStyles.dotColor] ??
        badgeStyles.dotColor["none"])
      : "";
  return (
    <span
      className={cn(
        badgeVariants({ variant, appearance }),
        icon && "pl-1.5",
        className,
      )}
    >
      {dotColor ? (
        <span
          aria-hidden="true"
          className={cn("size-1.75 shrink-0 rounded-full", dotColor)}
        />
      ) : null}
      {renderIconNode(icon)}
      {children}
    </span>
  );
}
