import { forwardRef, type ComponentPropsWithRef } from "react";
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import {
  DirectionProvider,
  useDirection,
} from "@base-ui/react/direction-provider";
import { cn } from "../utils/cn";

export type ScrollAreaProps = Omit<BaseScrollArea.Root.Props, "className"> & {
  className?: string;
  viewportClassName?: string;
  viewportProps?: Omit<
    ComponentPropsWithRef<typeof BaseScrollArea.Viewport>,
    "children" | "className"
  >;
  orientation?: "vertical" | "horizontal" | "both";
};

export const ScrollBar = forwardRef<
  HTMLDivElement,
  BaseScrollArea.Scrollbar.Props
>(function ScrollBar({ orientation = "vertical", className, ...props }, ref) {
  return (
    <BaseScrollArea.Scrollbar
      {...props}
      ref={ref}
      orientation={orientation}
      data-ui-part="scrollbar"
      className={(state) =>
        cn(
          "ui-scrollbar select-none",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      <BaseScrollArea.Thumb className="ui-scroll-thumb" />
    </BaseScrollArea.Scrollbar>
  );
});

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  function ScrollArea(
    {
      className,
      children,
      viewportClassName,
      viewportProps,
      orientation = "vertical",
      dir,
      "aria-label": label,
      "aria-labelledby": labelledBy,
      ...props
    },
    ref,
  ) {
    const inheritedDirection = useDirection();
    const direction = dir === "ltr" || dir === "rtl" ? dir : inheritedDirection;
    return (
      <DirectionProvider direction={direction}>
        <BaseScrollArea.Root
          {...props}
          dir={dir ?? direction}
          ref={ref}
          data-ui-component="ScrollArea"
          data-orientation={orientation}
          className={cn(
            "ui-scroll-area relative min-h-0 min-w-0 overflow-hidden",
            className,
          )}
        >
          <BaseScrollArea.Viewport
            {...viewportProps}
            data-ui-part="scroll-viewport"
            role={
              viewportProps?.role ??
              (label || labelledBy ? "region" : undefined)
            }
            aria-label={label}
            aria-labelledby={labelledBy}
            className={cn(
              "ui-scroll-viewport size-full rounded-[inherit]",
              viewportClassName,
            )}
            style={{
              overflowX: orientation === "vertical" ? "hidden" : "auto",
              overflowY: orientation === "horizontal" ? "hidden" : "auto",
              ...viewportProps?.style,
            }}
          >
            <BaseScrollArea.Content
              style={orientation === "vertical" ? { minWidth: 0 } : undefined}
            >
              {children}
            </BaseScrollArea.Content>
          </BaseScrollArea.Viewport>
          {orientation !== "horizontal" && <ScrollBar orientation="vertical" />}
          {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
          {orientation === "both" && (
            <BaseScrollArea.Corner className="ui-scroll-corner" />
          )}
        </BaseScrollArea.Root>
      </DirectionProvider>
    );
  },
);
