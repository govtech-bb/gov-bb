import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { touchTarget } from "./surface";

/** The switch's track, which takes the action colour while on (data-checked). Menu.SwitchItem draws one too. */
export const switchTrack =
  "group/switch relative inline-flex h-4.5 w-7.5 shrink-0 rounded-full bg-grey-60 transition-colors data-checked:bg-interactive";

/** The thumb inside a track, sliding across as its track turns on. */
export const switchThumb =
  "absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white transition-transform ease-out-quint group-data-checked/switch:translate-x-3 motion-reduce:transition-none";

type SwitchProps = Omit<BaseSwitch.Root.Props, "className" | "children" | "render"> & {
  /** Before the switch, and clicking it flips the switch. Without one, name the switch with `aria-label`. */
  label?: ReactNode;
  /** For the switch. */
  className?: string;
  /** For the row that holds the label and the switch. */
  labelClassName?: string;
};

/**
 * Turns a setting on or off at once, with no Save to press. The action colour means on. With a label, the row is 44px
 * tall under a coarse pointer, like a field.
 */
export function Switch({ label, className, labelClassName, ...props }: SwitchProps) {
  const control = (
    <BaseSwitch.Root
      className={cn(
        switchTrack,
        "cursor-pointer hover:bg-grey-70 data-checked:hover:bg-interactive-active data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb className={switchThumb} />
    </BaseSwitch.Root>
  );

  if (!label) return control;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-14 text-ink has-data-disabled:cursor-not-allowed has-data-disabled:text-muted",
        touchTarget,
        labelClassName,
      )}
    >
      <span className="min-w-0">{label}</span>
      {control}
    </label>
  );
}
