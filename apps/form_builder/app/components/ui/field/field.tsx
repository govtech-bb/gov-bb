import { Field as FieldBase } from "@base-ui/react/field";
import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import { Label } from "../label/label";

export type FieldErrorMatch = NonNullable<FieldBase.Error.Props["match"]>;
export type FieldError =
  | string
  | { message: ReactNode; match: FieldErrorMatch };

export function normalizeFieldError(error: FieldError | undefined) {
  return typeof error === "string"
    ? error
      ? { message: error, match: true as const }
      : undefined
    : error;
}

export interface FieldContentProps {
  label?: ReactNode;
  labelTooltip?: ReactNode;
  description?: ReactNode;
  error?: FieldError;
}

export type FieldProps = Omit<FieldBase.Root.Props, "className"> &
  FieldContentProps & {
    className?: string;
    required?: boolean;
    controlFirst?: boolean;
    /** For controls that provide their own label, such as Select. */
    hideLabel?: boolean;
  };

export function fieldVariants() {
  return "ui-field grid min-w-0 content-start gap-2";
}

export function Field({
  children,
  label,
  required,
  labelTooltip,
  error,
  description,
  controlFirst,
  hideLabel = false,
  className,
  invalid,
  ...props
}: FieldProps) {
  const validation = normalizeFieldError(error);
  return (
    <FieldBase.Root
      {...props}
      invalid={invalid ?? (validation?.match === true ? true : undefined)}
      data-ui-component="Field"
      data-ui-control-first={controlFirst || undefined}
      data-ui-layout={controlFirst === undefined ? "vertical" : "horizontal"}
      className={cn(fieldVariants(), className)}
    >
      {label != null && !hideLabel && (
        <FieldBase.Label className="m-0 text-base font-medium text-ui-default">
          <Label
            showOptional={required === false}
            tooltip={labelTooltip}
            asContent
          >
            {label}
          </Label>
        </FieldBase.Label>
      )}
      {children}
      {description && (
        <FieldBase.Description className="col-span-full text-sm text-ui-subtle">
          {description}
        </FieldBase.Description>
      )}
      {validation && (
        <FieldBase.Error
          className="col-span-full text-sm text-ui-danger"
          match={validation.match}
        >
          {validation.message}
        </FieldBase.Error>
      )}
    </FieldBase.Root>
  );
}
