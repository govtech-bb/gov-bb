import { Tooltip as TooltipBase } from "@base-ui/react/tooltip";
import {
  createContext,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { cn } from "../utils/cn";
import {
  usePortalContainer,
  type PortalContainer,
} from "../utils/portal-provider";
/** Tooltip side variant definitions mapping positions to their Tailwind classes. */
const tooltipStyles = {
  side: {
    top: "",
    bottom: "",
    left: "",
    right: "",
  },
} as const;
export type TooltipSide = keyof typeof tooltipStyles.side;
export interface TooltipVariantsProps {
  side?: TooltipSide;
}
export function tooltipVariants({ side = "top" }: TooltipVariantsProps = {}) {
  return cn(
    "ui-tooltip flex max-w-[min(20rem,var(--available-width))] flex-col rounded-md bg-ui-contrast px-2 py-1 text-xs font-medium text-ui-inverse",
    tooltipStyles.side[side] ?? tooltipStyles.side["top"],
  );
}
const TooltipDelayContext = createContext(200);
export function TooltipProvider({
  delay = 200,
  timeout = 300,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipBase.Provider>) {
  return (
    <TooltipDelayContext.Provider value={delay}>
      <TooltipBase.Provider delay={delay} timeout={timeout} {...props} />
    </TooltipDelayContext.Provider>
  );
}
type BaseTooltipProps = ComponentPropsWithoutRef<typeof TooltipBase.Root>;
type TriggerProps = ComponentPropsWithoutRef<typeof TooltipBase.Trigger>;
/** Alignment options for tooltip positioning. Source: PositionerProps["align"] */
type TooltipAlign = "start" | "center" | "end";
export type TooltipProps = BaseTooltipProps &
  TooltipVariantsProps & {
    /**
     * Alignment on the axis perpendicular to `side`.
     * - `"start"` — Align to the start edge
     * - `"center"` — Center-aligned
     * - `"end"` — Align to the end edge
     */
    align?: TooltipAlign;
    /** Distance between the trigger and tooltip. Defaults to 8px. */
    sideOffset?: number;
    asChild?: boolean;
    /** Additional CSS classes merged via `cn()`. */
    className?: string;
    /** Content to display inside the tooltip popup. */
    content: ReactNode;
    container?: PortalContainer;
    /**
     * How long to wait before closing the tooltip. Specified in milliseconds.
     * @default 0
     */
    closeDelay?: number;
    /**
     * How long to wait before opening the tooltip. Specified in milliseconds.
     * @default 200
     */
    delay?: number;
    render?: TriggerProps["render"];
  };
export function Tooltip({
  content,
  children,
  align,
  asChild,
  render,
  side = "top",
  sideOffset = 8,
  className,
  container: containerProp,
  closeDelay,
  delay,
  ...props
}: TooltipProps) {
  const tooltipId = useId();
  const inheritedDelay = useContext(TooltipDelayContext);
  const contextContainer = usePortalContainer();
  const container = containerProp ?? contextContainer ?? undefined;
  // Support both render prop (preferred) and deprecated asChild pattern
  // When using asChild, children IS the render element, so don't pass it as children
  const resolvedRender =
    render ?? (asChild ? (children as TriggerProps["render"]) : undefined);
  const shouldUseRender = resolvedRender !== undefined;
  return (
    <TooltipBase.Root {...props}>
      <TooltipBase.Trigger
        aria-describedby={tooltipId}
        closeDelay={closeDelay}
        delay={delay ?? inheritedDelay}
        className={cn(
          // Defensive resets when rendering as button wrapper (not render/asChild)
          // These prevent global button styles from polluting the trigger
          // Consumer styles passed via className will override these.
          !shouldUseRender &&
            "m-0 inline-flex h-auto min-h-0 items-center border-none bg-transparent p-0 shadow-none",
          !shouldUseRender && "cursor-default",
          className,
        )}
        render={resolvedRender}
      >
        {asChild ? undefined : (children as ReactNode)}
      </TooltipBase.Trigger>
      <TooltipBase.Portal container={container}>
        <TooltipBase.Positioner
          align={align}
          side={side}
          sideOffset={sideOffset}
          className="z-50 max-w-[var(--available-width)]"
        >
          <TooltipBase.Popup
            id={tooltipId}
            role="tooltip"
            className={tooltipVariants({ side })}
          >
            {content}
          </TooltipBase.Popup>
        </TooltipBase.Positioner>
      </TooltipBase.Portal>
    </TooltipBase.Root>
  );
}
