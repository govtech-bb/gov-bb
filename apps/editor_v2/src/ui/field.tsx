import { Field as BaseField } from "@base-ui/react/field";
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";
import type { ReactNode } from "react";
import { cn } from "../cn";

// As dense as its control: md beside a 36px field in a dialog or a panel, sm beside a 32px one in a popover or a menu
const sizes = {
  md: { root: "gap-2", note: "text-14" },
  sm: { root: "gap-1.5", note: "text-12" },
};

const labelText = "text-14 font-semibold text-ink";

type FieldProps = {
  label: ReactNode;
  /** What to enter, or what the setting changes. */
  hint?: ReactNode;
  /** Why the value can't be used. It marks the control invalid. */
  error?: ReactNode;
  disabled?: boolean;
  size?: keyof typeof sizes;
  /**
   * False when the control is a button, such as a Select's trigger: the label then names it and focuses it, where a
   * native label would press it.
   */
  nativeLabel?: boolean;
  className?: string;
  /** An Input or a Textarea. */
  children: ReactNode;
};

/** Labels a control, with a hint and an error that screen readers announce with it. */
export function Field({
  label,
  hint,
  error,
  disabled,
  size = "md",
  nativeLabel = true,
  className,
  children,
}: FieldProps) {
  return (
    <BaseField.Root
      invalid={!!error}
      disabled={disabled}
      className={cn("flex min-w-0 flex-col", sizes[size].root, className)}
    >
      <BaseField.Label
        nativeLabel={nativeLabel}
        render={nativeLabel ? undefined : <div />}
        className={labelText}
      >
        {label}
      </BaseField.Label>
      {children}
      {hint && (
        <BaseField.Description className={cn("text-muted", sizes[size].note)}>
          {hint}
        </BaseField.Description>
      )}
      {error && (
        <BaseField.Error match className={cn("text-error", sizes[size].note)}>
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}

/** A setting to read rather than change here, such as a date the server sets: a Field's label over its text. */
export function FieldText({
  label,
  error,
  className,
  children,
}: {
  label: ReactNode;
  /** Why the value can't be used. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className={labelText}>{label}</span>
      <p className="text-14 text-ink">{children}</p>
      {error && <p className="text-14 text-error">{error}</p>}
    </div>
  );
}

/**
 * Several controls under one label, such as the items chosen so far and a picker to add another. Each control keeps
 * its own name, where a Field would name its one control after the label.
 */
export function FieldGroup({
  label,
  error,
  className,
  children,
}: {
  label: ReactNode;
  /** Why the values can't be used. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <BaseFieldset.Root className={cn("flex min-w-0 flex-col gap-2", className)}>
      <BaseFieldset.Legend className={labelText}>{label}</BaseFieldset.Legend>
      {children}
      {error && <p className="text-14 text-error">{error}</p>}
    </BaseFieldset.Root>
  );
}
