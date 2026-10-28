import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { touchTarget } from "./surface";

// Ticked and partly ticked boxes fill with the action colour. Focus keeps its ring over every state
const box =
  "grid size-4 shrink-0 cursor-pointer place-items-center rounded-xs bg-white text-white shadow-input outline-none transition-[background-color,box-shadow] hover:shadow-input-hover focus-visible:shadow-input-focus data-checked:bg-interactive data-checked:shadow-none data-indeterminate:bg-interactive data-indeterminate:shadow-none data-checked:focus-visible:shadow-input-focus data-indeterminate:focus-visible:shadow-input-focus data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:size-3";

// The tick, or the dash of a partly ticked box: bold, so it reads at 12px
const mark = (indeterminate: boolean) =>
  indeterminate ? <Minus weight="bold" /> : <Check weight="bold" />;

// The label's size, as Field's: sm beside a popover's or a menu's 32px controls. The box sits on the first line
const sizes = {
  md: { label: "text-14 leading-5", box: "mt-0.5 pointer-coarse:mt-0" },
  sm: { label: "text-12 leading-4", box: "" },
};

type CheckboxProps = Omit<BaseCheckbox.Root.Props, "className" | "children" | "render"> & {
  /** Beside the box, and clicking it ticks the box. Without one, name the box with `aria-label`. */
  label?: ReactNode;
  size?: keyof typeof sizes;
  /** For the box. */
  className?: string;
  /** For the row that holds the box and its label. */
  labelClassName?: string;
};

/**
 * A tick box. `indeterminate` shows a dash, for a box over a list some of which is ticked. With a label, the row is
 * 44px tall under a coarse pointer, like a field.
 */
export function Checkbox({
  label,
  size = "md",
  className,
  labelClassName,
  ...props
}: CheckboxProps) {
  const control = (
    <BaseCheckbox.Root className={cn(box, label && sizes[size].box, className)} {...props}>
      <BaseCheckbox.Indicator
        className="flex"
        render={(indicator, state) => <span {...indicator}>{mark(state.indeterminate)}</span>}
      />
    </BaseCheckbox.Root>
  );

  if (!label) return control;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 text-ink has-data-disabled:cursor-not-allowed has-data-disabled:text-muted pointer-coarse:items-center",
        sizes[size].label,
        touchTarget,
        labelClassName,
      )}
    >
      {control}
      <span className="min-w-0">{label}</span>
    </label>
  );
}

/**
 * The box alone, for a row that is the checkbox itself, such as a Checklist's: the same box and bold tick, hidden from
 * screen readers, which hear the row.
 */
export function CheckboxMark({ checked }: { checked: boolean | "mixed" }) {
  return (
    <span
      aria-hidden="true"
      data-checked={checked === true ? "" : undefined}
      data-indeterminate={checked === "mixed" ? "" : undefined}
      className={cn(box, "pointer-events-none")}
    >
      {checked !== false && mark(checked === "mixed")}
    </span>
  );
}
