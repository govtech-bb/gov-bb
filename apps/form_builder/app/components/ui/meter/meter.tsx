import { Meter as BaseMeter } from "@base-ui/react/meter";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

export function meterVariants() {
  return cn(
    // Base styles
    "flex w-full flex-col gap-2",
  );
}
type RootProps = ComponentPropsWithoutRef<typeof BaseMeter.Root>;
export interface MeterProps extends RootProps {
  /** Custom formatted value text (e.g. "750 / 1,000") displayed instead of percentage. */
  customValue?: string;
  /** Label text displayed above the meter track. */
  label: string;
  /**
   * Whether to display the percentage value next to the label.
   * @default true
   */
  showValue?: boolean;
  /** Additional CSS classes for the track (background bar). */
  trackClassName?: string;
  /** Additional CSS classes for the indicator (filled bar). */
  indicatorClassName?: string;
}
export function Meter({
  value,
  customValue,
  label,
  showValue = true,
  className,
  trackClassName,
  indicatorClassName,
  ...props
}: MeterProps) {
  return (
    <BaseMeter.Root
      value={value}
      {...props}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <div className="flex items-center justify-between gap-4">
        <BaseMeter.Label className="text-xs text-ui-subtle">
          {label}
        </BaseMeter.Label>
        {customValue ? (
          <span className="text-sm font-medium text-ui-default tabular-nums">
            {customValue}
          </span>
        ) : (
          <>
            {showValue && (
              <BaseMeter.Value className="text-sm font-medium text-ui-default tabular-nums" />
            )}
          </>
        )}
      </div>
      <BaseMeter.Track
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-ui-tint",
          trackClassName,
        )}
      >
        <BaseMeter.Indicator
          className={cn(
            "absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-ui-brand via-ui-brand to-ui-brand transition-[width] duration-300 ease-out",
            indicatorClassName,
          )}
        />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}
