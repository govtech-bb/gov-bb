import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cn } from "../cn";

type SwitchProps = Omit<BaseSwitch.Root.Props, "className" | "children" | "render"> & {
  /** Before the switch, and clicking it flips the switch. Without one, name the switch with `aria-label`. */
  label?: ReactNode;
  className?: string;
};

/** Turns a setting on or off at once, with no Save to press. The action colour means on. */
export function Switch({ label, className, ...props }: SwitchProps) {
  const control = (
    <BaseSwitch.Root
      className={cn(
        "relative inline-flex h-4.5 w-7.5 shrink-0 cursor-pointer rounded-full bg-grey-60 transition-colors hover:bg-grey-70 data-checked:bg-interactive data-checked:hover:bg-interactive-active data-disabled:cursor-not-allowed data-disabled:opacity-50",
        !label && className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white transition-transform ease-out-quint data-checked:translate-x-3 motion-reduce:transition-none" />
    </BaseSwitch.Root>
  );

  if (!label) return control;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-14 text-ink has-data-disabled:cursor-not-allowed has-data-disabled:text-muted",
        className,
      )}
    >
      <span className="min-w-0">{label}</span>
      {control}
    </label>
  );
}
