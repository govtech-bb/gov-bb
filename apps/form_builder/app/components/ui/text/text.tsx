import {
  createElement,
  forwardRef,
  type ComponentPropsWithoutRef,
} from "react";
import { cn } from "../utils/cn";

const variants = {
  heading: "font-semibold text-ui-default",
  body: "text-ui-default",
  secondary: "text-ui-subtle",
  success: "text-ui-success",
  error: "text-ui-danger",
  mono: "font-mono text-ui-default",
  "mono-secondary": "font-mono text-ui-subtle",
} as const;
const sizes = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};
export type TextVariant = keyof typeof variants;
export type TextSize = keyof typeof sizes;
export type TextElement =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "p"
  | "span"
  | "label"
  | "dt"
  | "dd"
  | "li"
  | "figcaption"
  | "legend"
  | "pre"
  | "code"
  | "em"
  | "strong"
  | "small"
  | "abbr"
  | "time";
export type TextProps = ComponentPropsWithoutRef<"span"> & {
  as?: TextElement;
  variant?: TextVariant;
  size?: TextSize;
  bold?: boolean;
  truncate?: boolean;
};
export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  { as, variant = "body", size = "base", bold, truncate, className, ...props },
  ref,
) {
  const Tag =
    as ??
    (variant === "heading" ? "h2" : variant.startsWith("mono") ? "span" : "p");
  return createElement(Tag, {
    ...props,
    ref,
    className: cn(
      "m-0",
      variants[variant],
      sizes[size],
      bold && "font-semibold",
      truncate && "min-w-0 truncate",
      className,
    ),
  });
});
