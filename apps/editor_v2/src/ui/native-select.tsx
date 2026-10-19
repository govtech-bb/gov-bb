import { Field as BaseField } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import { CaretDown } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode, Ref } from "react";
import { cn } from "../cn";
import { input } from "./input";

type NativeSelectProps = Omit<ComponentProps<"select">, "size" | "className"> & {
  size?: "md" | "sm";
  /** Before the chosen option, such as a status dot. */
  icon?: ReactNode;
  /** For the box around the select and its caret: its width and margins. */
  className?: string;
};

/**
 * The browser's own select, in the Input's frame with Select's caret. For a short list of plain options, where the
 * platform's picker serves best. In a Field, it takes the field's label, hint and error.
 */
export function NativeSelect({
  size,
  icon,
  className,
  ref,
  children,
  ...props
}: NativeSelectProps) {
  return (
    <span className={cn("relative flex min-w-0", className)}>
      {icon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute start-2.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-muted [&>svg]:size-4"
        >
          {icon}
        </span>
      )}
      <BaseField.Control
        // SAFETY: Field.Control merges this with its own ref and gives both to the element it renders: this select
        ref={ref as Ref<HTMLInputElement>}
        render={(control) => (
          <select
            {...mergeProps<"select">(control, props)}
            className={cn(input(size), "cursor-pointer appearance-none pe-8", icon && "ps-8")}
          >
            {children}
          </select>
        )}
      />
      <CaretDown
        aria-hidden="true"
        className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
      />
    </span>
  );
}
