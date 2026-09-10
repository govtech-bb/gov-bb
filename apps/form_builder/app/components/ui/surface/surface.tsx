import { createElement, forwardRef, type ElementType } from "react";
import { useRender } from "@base-ui/react/use-render";
import { mergeProps } from "@base-ui/react/merge-props";
import { cn } from "../utils/cn";

export type SurfaceColor = "primary" | "secondary";
export type SurfaceProps = useRender.ComponentProps<"div"> & {
  color?: SurfaceColor;
  as?: ElementType;
};
export function surfaceVariants({
  color = "primary",
}: { color?: SurfaceColor } = {}) {
  return cn(
    "rounded-lg text-ui-default ring ring-ui-hairline",
    color === "secondary" ? "bg-ui-tint" : "bg-ui-base",
  );
}
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  function Surface(
    { color = "primary", as, render, className, ...props },
    ref,
  ) {
    return useRender({
      defaultTagName: "div",
      render: render ?? (as ? createElement(as) : undefined),
      ref,
      props: mergeProps<"div">(
        {
          className: cn(surfaceVariants({ color }), className),
        },
        props,
      ),
    });
  },
);
