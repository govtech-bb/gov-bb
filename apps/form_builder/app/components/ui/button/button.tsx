import React from "react";
import { ArrowsClockwise, type Icon } from "@phosphor-icons/react";
import { Loader } from "../loader/loader";
import { Tooltip } from "../tooltip/tooltip";
import { cn } from "../utils/cn";
import { useLinkComponent } from "../utils/link-provider";
import { controlSizes, type ControlSize } from "../utils/control";

const variants = {
  primary: "ui-button-primary text-ui-inverse",
  secondary: "text-ui-default",
  ghost: "ui-button-ghost text-ui-subtle hover:text-ui-default",
  outline: "ui-button-outline text-ui-default",
  destructive: "ui-button-destructive text-ui-on-status",
  "secondary-destructive": "ui-button-outline text-ui-danger",
} as const;
const compactSizes = {
  xs: "size-6",
  sm: "size-7",
  base: "size-9",
  lg: "size-10",
};
export type ButtonSize = ControlSize;
export type ButtonShape = "base" | "square" | "circle";
export type ButtonVariant = keyof typeof variants;
export interface ButtonVariantsProps {
  size?: ButtonSize;
  shape?: ButtonShape;
  variant?: ButtonVariant;
}

export function buttonVariants({
  size = "base",
  shape = "base",
  variant = "secondary",
}: ButtonVariantsProps = {}) {
  return cn(
    "ui-button relative isolate inline-flex w-max shrink-0 items-center justify-center border-0 font-medium select-none outline-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
    controlSizes[size] ?? controlSizes.base,
    variants[variant] ?? variants.secondary,
    shape !== "base" && [compactSizes[size], "p-0"],
    shape === "circle" && "rounded-full",
  );
}

const renderIconNode = (IconComponent?: Icon | React.ReactNode) => {
  if (!IconComponent) return null;
  if (React.isValidElement(IconComponent)) return IconComponent;
  const Comp = IconComponent as React.ComponentType<Record<string, unknown>>;
  return <Comp />;
};
const ANCHOR_ONLY_PROPS = new Set([
  "href",
  "target",
  "rel",
  "download",
  "hrefLang",
  "media",
  "ping",
  "referrerPolicy",
  "linksExternal",
]);
const toDisabledButtonProps = (
  props: React.AnchorHTMLAttributes<HTMLAnchorElement>,
): React.ButtonHTMLAttributes<HTMLButtonElement> => {
  const result: Partial<React.AnchorHTMLAttributes<HTMLAnchorElement>> = {
    ...props,
  };
  for (const key of Object.keys(result)) {
    // event handlers are inert on a disabled button, and anchor-only attrs are invalid on it
    if (key.startsWith("on") || ANCHOR_ONLY_PROPS.has(key)) {
      delete result[key as keyof typeof result];
    }
  }
  return result as React.ButtonHTMLAttributes<HTMLButtonElement>;
};
const renderButtonContent = (
  iconNode: React.ReactNode,
  children: React.ReactNode,
) => (
  <>
    {iconNode}
    {children}
  </>
);
const getTitleLabel = (title: React.ReactNode) => {
  if (typeof title === "string") return title;
  if (typeof title === "number") return String(title);
  return undefined;
};
type ButtonBaseProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Content rendered inside the button. */
  children?: React.ReactNode;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  /** Icon from `@phosphor-icons/react` or a React element. Rendered before children. */
  icon?: Icon | React.ReactNode;
  /** Shows a loading spinner and disables interaction. */
  loading?: boolean;
  /** When set, wraps the button in a Tooltip with this content. */
  title?: React.ReactNode;
};
type ButtonWithTextProps = ButtonBaseProps & {
  shape?: "base";
  size?: ButtonSize;
  variant?: ButtonVariant;
};
type IconOnlyButtonAccessibleNameProps =
  | {
      /** Required for icon-only buttons to provide an accessible label for screen readers. */
      "aria-label": string;
      "aria-labelledby"?: string;
    }
  | {
      "aria-label"?: string;
      /** References an element that provides the accessible label for screen readers. */
      "aria-labelledby": string;
    }
  | {
      /** Used as tooltip content and as a fallback accessible label when no children are provided. */
      title: string | number;
      "aria-label"?: string;
      "aria-labelledby"?: string;
    };
type IconOnlyButtonProps = ButtonBaseProps &
  IconOnlyButtonAccessibleNameProps & {
    shape: "square" | "circle";
    size?: ButtonSize;
    variant?: ButtonVariant;
  };
export type ButtonProps = ButtonWithTextProps | IconOnlyButtonProps;
export type RefreshButtonProps = Omit<
  IconOnlyButtonProps,
  "children" | "icon" | "shape"
>;
export type LinkButtonProps = React.AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonVariantsProps & {
    /** Content rendered inside the link button. */
    children?: React.ReactNode;
    /** Additional CSS classes merged via `cn()`. */
    className?: string;
    /** When `true`, the button is disabled. We render an actual html button with `disabled` attribute. */
    disabled?: boolean;
    /** Icon from `@phosphor-icons/react` or a React element. Rendered before children. */
    icon?: Icon | React.ReactNode;
    /** When `true`, opens in a new tab with `rel="noopener noreferrer"`. */
    external?: boolean;
    linksExternal?: boolean;
  };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      disabled,
      loading,
      shape = "base",
      size = "base",
      variant = "secondary",
      icon: IconComponent,
      style,
      title,
      ...props
    },
    ref,
  ) => {
    const { type, ...restProps } = props;
    const titleLabel = getTitleLabel(title);
    const buttonProps = {
      ...restProps,
      ...(!React.Children.count(children) &&
        !restProps["aria-label"] &&
        !restProps["aria-labelledby"] &&
        titleLabel && { "aria-label": titleLabel }),
    };
    const content = renderButtonContent(
      renderIconNode(IconComponent),
      children,
    );
    const button = (
      <button
        ref={ref}
        data-ui-component="Button"
        className={cn(
          buttonVariants({ variant, size, shape }),
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        disabled={loading || disabled}
        aria-busy={loading || undefined}
        style={style}
        type={type ?? "button"}
        {...buttonProps}
      >
        {loading ? (
          <>
            <span className="inline-flex items-center justify-center gap-[inherit] opacity-0">
              {content}
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader size={size === "xs" || size === "sm" ? 14 : 16} />
            </span>
          </>
        ) : (
          content
        )}
      </button>
    );
    if (title && (disabled || loading)) {
      return (
        <Tooltip content={title} render={<span className="inline-flex" />}>
          {button}
        </Tooltip>
      );
    }
    if (title) {
      return <Tooltip content={title} render={button} />;
    }
    return button;
  },
);
Button.displayName = "Button";
export const RefreshButton = ({
  "aria-label": ariaLabel = "Refresh",
  loading,
  ...props
}: RefreshButtonProps) => (
  <Button shape="square" aria-label={ariaLabel} {...props}>
    <ArrowsClockwise
      className={cn({
        "animate-refresh": loading,
        "size-4.5": props.size === "base" || !props.size,
        "size-4": props.size === "sm",
        "size-5": props.size === "lg",
      })}
    />
  </Button>
);
export const LinkButton = React.forwardRef<HTMLAnchorElement, LinkButtonProps>(
  (
    {
      children,
      className,
      disabled = false,
      external,
      href,
      shape = "base",
      size = "base",
      variant = "ghost",
      icon: IconComponent,
      style,
      title,
      // linksExternal = false,
      ...props
    },
    ref,
  ) => {
    const LinkComponent = useLinkComponent();
    const externalProps = external
      ? { target: "_blank", rel: "noopener noreferrer" }
      : {};
    if (disabled) {
      // ref is intentionally not forwarded: it's typed for the anchor, but the disabled state renders a button
      return (
        <Button
          {...toDisabledButtonProps(props)}
          className={cn("select-text", className)}
          data-ui-component="LinkButton"
          disabled
          icon={IconComponent}
          shape={shape as "base"}
          size={size}
          style={style}
          title={title}
          variant={variant}
        >
          {children}
        </Button>
      );
    }
    const link = (
      <LinkComponent
        ref={ref}
        data-ui-component="LinkButton"
        className={cn(
          buttonVariants({ variant, size, shape }),
          "flex items-center no-underline! select-text",
          className,
        )}
        href={href}
        style={style}
        {...externalProps}
        {...props}
      >
        {renderButtonContent(renderIconNode(IconComponent), children)}
      </LinkComponent>
    );
    if (title) {
      return <Tooltip content={title} render={link} />;
    }
    return link;
  },
);
LinkButton.displayName = "LinkButton";
