import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../cn";

// Ticked and partly ticked boxes fill with the action colour. Focus keeps its ring over every state
const box =
  "grid size-4 shrink-0 cursor-pointer place-items-center rounded-xs bg-white text-white shadow-input outline-none transition-[background-color,box-shadow] hover:shadow-input-hover focus-visible:shadow-input-focus data-checked:bg-interactive data-checked:shadow-none data-indeterminate:bg-interactive data-indeterminate:shadow-none data-checked:focus-visible:shadow-input-focus data-indeterminate:focus-visible:shadow-input-focus data-disabled:cursor-not-allowed data-disabled:opacity-50";

type CheckboxProps = Omit<BaseCheckbox.Root.Props, "className" | "children" | "render"> & {
  /** Beside the box, and clicking it ticks the box. Without one, name the box with `aria-label`. */
  label?: ReactNode;
  className?: string;
};

/** A tick box. `indeterminate` shows a dash, for a box over a list some of which is ticked. */
export function Checkbox({ label, className, ...props }: CheckboxProps) {
  const control = (
    <BaseCheckbox.Root className={cn(box, label ? "mt-0.5" : className)} {...props}>
      <BaseCheckbox.Indicator
        className="flex [&>svg]:size-3"
        render={(indicator, state) => (
          <span {...indicator}>
            {state.indeterminate ? <Minus weight="bold" /> : <Check weight="bold" />}
          </span>
        )}
      />
    </BaseCheckbox.Root>
  );

  if (!label) return control;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 text-14 leading-5 text-ink has-data-disabled:cursor-not-allowed has-data-disabled:text-muted",
        className,
      )}
    >
      {control}
      <span className="min-w-0">{label}</span>
    </label>
  );
}
