import React, {
  forwardRef,
  useContext,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { cn } from "../utils/cn";
import { type ButtonProps, Button as ButtonExternal } from "../button/button";
import { Tooltip, type TooltipSide } from "../tooltip/tooltip";
import type { InputSize } from "../input/input";
import {
  INPUT_GROUP_SIZE,
  InputGroupAddonContext,
  useInputGroupContext,
} from "./context";
const COMPACT_BUTTON_SIZE: Record<InputSize, InputSize> = {
  xs: "xs",
  sm: "xs",
  base: "sm",
  lg: "base",
};
export type InputGroupButtonProps = ButtonProps & {
  tooltip?: ReactNode;
  /**
   * Preferred side for the tooltip popup.
   * @default "bottom"
   */
  tooltipSide?: TooltipSide;
};
export const Button = forwardRef<
  HTMLButtonElement,
  PropsWithChildren<InputGroupButtonProps>
>(
  (
    {
      children,
      className,
      variant,
      size,
      disabled,
      tooltip,
      tooltipSide = "bottom",
      icon,
      ...props
    }: PropsWithChildren<InputGroupButtonProps>,
    ref: React.ForwardedRef<HTMLButtonElement>,
  ) => {
    const context = useInputGroupContext("Button");
    const isInsideAddon = useContext(InputGroupAddonContext);
    const isDisabled = disabled ?? context?.disabled;
    const isIndividual =
      context?.focusMode === "individual" || context?.focusMode === "hybrid";
    const effectiveVariant = variant ?? "ghost";
    if (
      process.env.NODE_ENV !== "production" &&
      context &&
      effectiveVariant === "ghost" &&
      !isInsideAddon
    ) {
      console.warn(
        "InputGroup.Button: Ghost buttons should be wrapped in <InputGroup.Addon> for correct spacing.",
      );
    }
    if (
      process.env.NODE_ENV !== "production" &&
      context &&
      size !== undefined
    ) {
      console.warn(
        "InputGroup.Button: Set `size` on <InputGroup> instead of <InputGroup.Button>.",
      );
    }
    // Derive aria-label from tooltip string when the button has no explicit label.
    // Icon-only buttons require an aria-label for a11y.
    const tooltipAriaLabel =
      typeof tooltip === "string" && !props["aria-label"] ? tooltip : undefined;
    // Pre-render the icon with the context-derived size so it matches the
    // Addon icon sizing (e.g. 18px at "base"). Without this, Button's
    // internal renderIconNode renders `<Icon />` with no size prop,
    // falling back to CSS font-size (~14px).
    const contextIconSize = context
      ? INPUT_GROUP_SIZE[context.size ?? "base"].iconSize
      : undefined;
    const sizedIcon =
      icon &&
      contextIconSize &&
      (typeof icon === "function" ||
        (typeof icon === "object" &&
          icon !== null &&
          !React.isValidElement(icon)))
        ? React.createElement(
            icon as React.ComponentType<{
              size?: number;
            }>,
            {
              size: contextIconSize,
            },
          )
        : icon;
    const btn = (
      <ButtonExternal
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-label={tooltipAriaLabel}
        {...props}
        icon={sizedIcon}
        variant={variant ?? "ghost"}
        // Individual: use the group's size directly so buttons match the input height.
        // Container: render one size down so the button stays subordinate to the input.
        size={
          size ??
          (isIndividual
            ? (context?.size ?? "sm")
            : (COMPACT_BUTTON_SIZE[context?.size ?? "base"] ?? "sm"))
        }
        className={cn(
          // Ensure clicks register even when parent has pointer-events-none (e.g. disabled overlay)
          "pointer-events-auto",
          // Suppress the base Button's drop shadow so InputGroup matches the flat
          // appearance of the standalone Input (ghost already sets shadow-none,
          // but secondary/primary/outline etc. inherit shadow-xs from Button base)
          "shadow-none",
          // Suppress the base Button's non-visible focus ring in all modes
          "focus:ring-0",
          // Container-zone buttons: use a subtle ring as focus indicator
          // (outline doesn't work because the base Button's `focus:outline-none`
          // sets `outline-style: none` which our outline-width/color can't override)
          !isIndividual &&
            "focus-visible:ring-[1.5px] focus-visible:ring-ui-focus/50",
          // Individual mode: each button owns its own border and focus indicator
          isIndividual && [
            // Own border replaces the container's shared ring; force full height
            "relative h-full! rounded-none border border-ui-hairline ring-0 focus-visible:ring-0",
            "first:rounded-l-[inherit] last:rounded-r-[inherit]",
            // Negative margin (not border-l-0) so the border is still paintable on focus
            "not-first:-ml-px",
            "hover:z-1",
            // z-2 lifts above hovered siblings so focus border isn't clipped
            "focus:z-2",
            "focus-visible:border-ui-focus/50",
            "disabled:bg-ui-tint disabled:text-ui-inactive!",
          ],
          className,
        )}
      >
        {children}
      </ButtonExternal>
    );
    if (tooltip) {
      return (
        <Tooltip content={tooltip} side={tooltipSide} asChild>
          {btn}
        </Tooltip>
      );
    }
    return btn;
  },
);
Button.displayName = "InputGroup.Button";
