import {
  type HTMLAttributes,
  type ReactNode,
  forwardRef,
  isValidElement,
} from "react";
import { cn } from "../utils/cn";
import { resolveVariant } from "../utils/resolve-variant";
import { Link } from "../link/link";
import {
  BannerAction,
  type BannerActionSize,
  BannerActionContext,
} from "./banner-action";
const bannerBase = "flex w-full";
/** Banner variant definitions mapping style options to their Tailwind classes and descriptions. */
const bannerStyles = {
  variant: {
    default: {
      classes: "bg-ui-info-tint text-ui-info",
      iconClasses: "fill-ui-info",
    },
    success: {
      classes: "bg-ui-success-tint text-ui-success",
      iconClasses: "fill-ui-success",
    },
    alert: {
      classes: "bg-ui-warning-tint text-ui-warning",
      iconClasses: "fill-ui-warning",
    },
    error: {
      classes: "bg-ui-danger-tint text-ui-danger",
      iconClasses: "fill-ui-danger",
    },
    secondary: {
      classes: "bg-ui-contrast/5 text-ui-default/70",
      iconClasses: "fill-ui-line",
    },
  },
  size: {
    base: {
      classes: "items-start gap-3 rounded-lg px-4 py-3 text-base",
    },
    sm: {
      classes: "items-center gap-2 rounded-md px-3 py-2 text-sm",
    },
  },
} as const;
export type BannerVariant = keyof typeof bannerStyles.variant;
export type BannerSize = keyof typeof bannerStyles.size;
const BANNER_SIZE_PARTS: Record<
  BannerSize,
  {
    row: string;
    icon: string;
    description: string;
    action: BannerActionSize;
  }
> = {
  base: {
    row: "gap-3",
    icon: "h-[1.375em]",
    description: "text-sm",
    action: "sm",
  },
  sm: {
    row: "gap-2",
    icon: "h-[1.25em]",
    description: "text-sm",
    action: "xs",
  },
};
// The `Banner.Action` CTA compound lives in ./banner-action
// and is attached to `Banner` via Object.assign at the bottom of this file.
export type {
  BannerActionVariant,
  BannerActionSize,
  BannerActionProps,
} from "./banner-action";
export interface BannerVariantsProps {
  variant?: BannerVariant;
  /**
   * Size of the banner.
   * - `"base"` — Default full-size banner
   * - `"sm"` — Compact banner for dialogs and other tight spaces
   * @default "base"
   */
  size?: BannerSize;
}
export function bannerVariants({
  variant = "default",
  size = "base",
}: BannerVariantsProps = {}) {
  const resolvedVariant = resolveVariant(
    bannerStyles.variant,
    variant,
    "default",
  );
  const resolvedSize = resolveVariant(bannerStyles.size, size, "base");
  return cn(bannerBase, resolvedVariant.classes, resolvedSize.classes);
}

export interface BannerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "title"
> {
  /** Icon element rendered before the banner content (e.g. from `@phosphor-icons/react`). */
  icon?: ReactNode;
  /** Primary heading text for the banner. Use for i18n string injection. */
  title?: string;
  /** Secondary description text displayed below the title. Use for i18n string injection. */
  description?: ReactNode;
  action?: ReactNode;
  text?: string;
  children?: ReactNode;
  variant?: BannerVariant;
  size?: BannerSize;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
}
const BannerRoot = forwardRef<HTMLDivElement, BannerProps>(function BannerRoot(
  {
    icon,
    title,
    description,
    action,
    children,
    text,
    variant = "default",
    size = "base",
    className,
    ...props
  },
  ref,
) {
  const variantConfig = resolveVariant(
    bannerStyles.variant,
    variant,
    "default",
  );
  const sizeParts = BANNER_SIZE_PARTS[size];
  // Compact banners keep the title and description on one line (inline spans)
  // rather than stacking them, to stay short in dialogs and other tight spaces.
  const isCompact = size === "sm";
  const hasInlineLinkAction =
    isCompact && isValidElement(action) && action.type === Link;
  // Structured mode: title and/or description provided
  if (title || description) {
    return (
      <BannerActionContext.Provider value={{ variant, size: sizeParts.action }}>
        <div
          ref={ref}
          className={cn(bannerVariants({ variant, size }), className)}
          {...props}
        >
          {icon && (
            <span
              className={cn(
                "flex shrink-0 items-center",
                sizeParts.icon,
                variantConfig.iconClasses,
              )}
            >
              {icon}
            </span>
          )}
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center justify-between",
              sizeParts.row,
              !title && "pt-px",
            )}
          >
            {isCompact ? (
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                {title && (
                  <span className="leading-snug font-medium">
                    {title}
                    {!description && hasInlineLinkAction && (
                      <span className="ml-1.5 [&_[data-ui-component=Link]]:inline">
                        {action}
                      </span>
                    )}
                  </span>
                )}
                {description && (
                  <span className={cn(sizeParts.description, "leading-snug")}>
                    {description}
                    {hasInlineLinkAction && (
                      <span className="ml-1.5 [&_[data-ui-component=Link]]:inline">
                        {action}
                      </span>
                    )}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {title && <p className="leading-snug font-medium">{title}</p>}
                {description && (
                  <div className={cn(sizeParts.description, "leading-snug")}>
                    {isValidElement(description) ? (
                      description
                    ) : (
                      <p>{description}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {!hasInlineLinkAction && action != null && (
              <div className="flex shrink-0 items-center gap-2">{action}</div>
            )}
          </div>
        </div>
      </BannerActionContext.Provider>
    );
  }
  // Legacy mode: children or text prop
  const value = children ?? text;
  const content = isValidElement(value) ? value : <p>{value}</p>;
  return (
    <BannerActionContext.Provider value={{ variant, size: sizeParts.action }}>
      <div
        ref={ref}
        className={cn(bannerVariants({ variant, size }), className)}
        {...props}
      >
        {icon && (
          <span className={cn("shrink-0", variantConfig.iconClasses)}>
            {icon}
          </span>
        )}
        {content}
      </div>
    </BannerActionContext.Provider>
  );
});
BannerRoot.displayName = "Banner";
/**
 * Full-width message bar with an optional trailing CTA slot.
 *
 * `Banner.Action` is an accent-aware CTA button
 * (`variant="primary" | "secondary" | "ghost"`).
 */
export const Banner = Object.assign(BannerRoot, {
  Action: BannerAction,
});
