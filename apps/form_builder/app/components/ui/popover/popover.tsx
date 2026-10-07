import { Elevated } from "../surface/elevation";
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";
import {
  usePortalContainer,
  type PortalContainer,
} from "../utils/portal-provider";

export type PopoverRootProps = ComponentPropsWithoutRef<
  typeof BasePopover.Root
>;
export type PopoverTriggerProps = ComponentPropsWithoutRef<
  typeof BasePopover.Trigger
> & { asChild?: boolean };
export type PopoverCloseProps = ComponentPropsWithoutRef<
  typeof BasePopover.Close
> & { asChild?: boolean };
export type PopoverTitleProps = ComponentPropsWithoutRef<
  typeof BasePopover.Title
>;
export type PopoverDescriptionProps = ComponentPropsWithoutRef<
  typeof BasePopover.Description
>;
export type PopoverSide = "top" | "bottom" | "left" | "right";
export type PopoverContentProps = Omit<BasePopover.Popup.Props, "className"> &
  Pick<
    BasePopover.Positioner.Props,
    | "side"
    | "align"
    | "sideOffset"
    | "alignOffset"
    | "anchor"
    | "positionMethod"
    | "collisionBoundary"
    | "collisionPadding"
  > & { className?: string; container?: PortalContainer };

export function PopoverRoot(props: PopoverRootProps) {
  return <BasePopover.Root {...props} />;
}
export function PopoverTrigger({
  asChild,
  children,
  render,
  ...props
}: PopoverTriggerProps) {
  return (
    <BasePopover.Trigger
      {...props}
      render={
        render ??
        (asChild ? (children as PopoverTriggerProps["render"]) : undefined)
      }
    >
      {asChild ? undefined : children}
    </BasePopover.Trigger>
  );
}
export function PopoverClose({
  asChild,
  children,
  render,
  ...props
}: PopoverCloseProps) {
  return (
    <BasePopover.Close
      {...props}
      render={
        render ??
        (asChild ? (children as PopoverCloseProps["render"]) : undefined)
      }
    >
      {asChild ? undefined : children}
    </BasePopover.Close>
  );
}
export function PopoverContent({
  container: containerProp,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  alignOffset,
  anchor,
  positionMethod,
  collisionBoundary,
  collisionPadding,
  className,
  ...props
}: PopoverContentProps) {
  const contextContainer = usePortalContainer();
  return (
    <BasePopover.Portal
      container={containerProp ?? contextContainer ?? undefined}
    >
      <BasePopover.Positioner
        className="z-50"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        anchor={anchor}
        positionMethod={positionMethod}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
      >
        <Elevated
          offset={2}
          shadowLevel={3}
          render={<BasePopover.Popup {...props} />}
          className={cn(
            "ui-popup ui-dropdown-popup max-h-(--available-height) max-w-(--available-width) ui-scroll-native overflow-auto p-4 text-base outline-none",
            className,
          )}
        />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
export function PopoverTitle({ className, ...props }: PopoverTitleProps) {
  return (
    <BasePopover.Title
      {...props}
      className={cn("m-0 text-base font-semibold", className)}
    />
  );
}
export function PopoverDescription({
  className,
  ...props
}: PopoverDescriptionProps) {
  return (
    <BasePopover.Description
      {...props}
      className={cn("m-0 text-sm text-ui-subtle", className)}
    />
  );
}
export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverTrigger,
  Close: PopoverClose,
  Content: PopoverContent,
  Title: PopoverTitle,
  Description: PopoverDescription,
});
