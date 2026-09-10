import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Input as BaseInput } from "@base-ui/react/input";
import { Field, type FieldContentProps } from "../field/field";
import { controlSizes, type ControlSize } from "../utils/control";
import { cn } from "../utils/cn";

export type InputSize = ControlSize;
export type InputVariant = "default" | "error";
export const inputStyles = { size: controlSizes };
export interface InputVariantsProps {
  size?: InputSize;
  variant?: InputVariant;
  parentFocusIndicator?: boolean;
  focusIndicator?: boolean;
}

export function inputVariants({
  size = "base",
  variant = "default",
  parentFocusIndicator = false,
}: InputVariantsProps = {}) {
  return cn(
    "ui-control border-0 bg-ui-control text-ui-default ring ring-ui-line outline-none placeholder:text-ui-placeholder disabled:cursor-not-allowed disabled:opacity-50",
    controlSizes[size] ?? controlSizes.base,
    variant === "error" && "ui-control-invalid",
    parentFocusIndicator && "ui-control-group",
  );
}

export type InputProps = Omit<
  ComponentPropsWithoutRef<typeof BaseInput>,
  "size"
> &
  FieldContentProps & {
    size?: InputSize;
    variant?: InputVariant;
    passwordManagerIgnore?: boolean;
  };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    size = "base",
    variant,
    label,
    labelTooltip,
    description,
    error,
    passwordManagerIgnore = false,
    ...props
  },
  ref,
) {
  const input = (
    <BaseInput
      {...props}
      ref={ref}
      data-ui-component="Input"
      className={cn(
        inputVariants({
          size,
          variant,
        }),
        className,
      )}
      {...(passwordManagerIgnore
        ? {
            "data-1p-ignore": "true",
            "data-bwignore": "true",
            "data-lpignore": "true",
            "data-form-type": "other",
          }
        : {})}
    />
  );
  return label != null || description || error ? (
    <Field
      label={label}
      required={props.required}
      labelTooltip={labelTooltip}
      description={description}
      error={error}
    >
      {input}
    </Field>
  ) : (
    input
  );
});
