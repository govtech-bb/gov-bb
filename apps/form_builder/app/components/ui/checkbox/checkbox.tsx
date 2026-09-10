import { forwardRef, createContext, useContext, type ReactNode } from "react";
import { CheckIcon, MinusIcon } from "@phosphor-icons/react";
import { cn } from "../utils/cn";
import { Label } from "../label";
import { Fieldset } from "@base-ui/react/fieldset";
import { Field as FieldBase } from "@base-ui/react/field";
import { CheckboxGroup as BaseCheckboxGroup } from "@base-ui/react/checkbox-group";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
/** Event details passed to onCheckedChange callback. Re-exported from Base UI. */
export type CheckboxChangeEventDetails = Parameters<
  NonNullable<BaseCheckbox.Root.Props["onCheckedChange"]>
>[1];
/** Checkbox variant definitions mapping variant names to their Tailwind classes. */
const checkboxStyles = {
  variant: {
    default: "[&:focus-within>span]:ring-ui-focus [&:hover>span]:ring-ui-line",
    error: "[&>span]:ring-ui-danger",
  },
} as const;
export type CheckboxVariant = keyof typeof checkboxStyles.variant;
export interface CheckboxVariantsProps {
  /**
   * Visual variant.
   * - `"default"` — Standard checkbox appearance
   * - `"error"` — Error state for validation failures
   * @default "default"
   */
  variant?: CheckboxVariant;
}
export function checkboxVariants({
  variant = "default",
}: CheckboxVariantsProps = {}) {
  return cn(
    checkboxStyles.variant[variant] ?? checkboxStyles.variant["default"],
  );
}
// Context for passing controlFirst from Group to Items
const CheckboxGroupContext = createContext<{
  controlFirst: boolean;
}>({
  controlFirst: true,
});
export type CheckboxProps = {
  id?: string;
  /** Visual variant: "default" or "error" for validation failures (visual only, no error text) */
  variant?: CheckboxVariant;
  /** Label content for the checkbox (enables built-in Field wrapper) - can be a string or any React node */
  label?: ReactNode;
  /** Tooltip content to display next to the label via an info icon */
  labelTooltip?: ReactNode;
  /** When true (default), checkbox appears before label. When false, label appears before checkbox. */
  controlFirst?: boolean;
  /** Whether the checkbox is checked (controlled) */
  checked?: boolean;
  /** Whether the checkbox is in indeterminate state */
  indeterminate?: boolean;
  /** Whether the checkbox is disabled */
  disabled?: boolean;
  /** Callback when the checked state changes */
  onCheckedChange?: BaseCheckbox.Root.Props["onCheckedChange"];
  /** Name for form submission */
  name?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Additional class name */
  className?: string;
  /** Accessible label when no visible label is provided */
  "aria-label"?: string;
  /** ID of element that labels this checkbox */
  "aria-labelledby"?: string;
};
export interface CheckboxLegendProps {
  /** Legend content */
  children: ReactNode;
  /** Additional CSS classes (e.g. "sr-only" to visually hide the legend) */
  className?: string;
}
export interface CheckboxGroupProps {
  /**
   * Legend text for the group.
   * For more control over legend styling, omit this prop and use `<Checkbox.Legend>` as a child instead.
   */
  legend?: string;
  /** Child Checkbox.Item components (and optionally a Checkbox.Legend) */
  children: ReactNode;
  /** Error message for the group (only appears in groups, not single checkboxes) */
  error?: string;
  /** Helper text for the group */
  description?: ReactNode;
  /** Values of checkboxes that should be initially checked (uncontrolled) */
  defaultValue?: string[];
  /** Values of checkboxes that should be checked (controlled) */
  value?: string[];
  /** Event handler called when checkbox values change */
  onValueChange?: (value: string[]) => void;
  /** All possible checkbox values (required for parent checkbox pattern) */
  allValues?: string[];
  /** Whether all checkboxes in the group are disabled */
  disabled?: boolean;
  /** When true (default), checkbox appears before label. When false, label appears before checkbox. */
  controlFirst?: boolean;
  /** Additional CSS classes */
  className?: string;
}
/**
 * Individual checkbox item within a group
 */
export type CheckboxItemProps = {
  /** Visual variant: "default" or "error" for validation failures */
  variant?: CheckboxVariant;
  /** Label text displayed next to checkbox */
  label: string;
  /** Value of the checkbox (required when used in Checkbox.Group) */
  value?: string;
  /** Additional CSS classes for the label wrapper */
  className?: string;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  /** Callback when the checked state changes */
  onCheckedChange?: BaseCheckbox.Root.Props["onCheckedChange"];
  name?: string;
};
// Single checkbox with built-in Field
const CheckboxBase = forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      className,
      checked,
      indeterminate,
      disabled,
      variant = "default",
      label,
      labelTooltip,
      controlFirst = true,
      onCheckedChange,
      required,
      name,
      ...props
    },
    ref,
  ) => {
    // A11y enforcement: warn in dev if no accessible name provided
    if (process.env.NODE_ENV !== "production") {
      const hasLabel = Boolean(label);
      const hasAriaLabel = Boolean(props["aria-label"]);
      const hasAriaLabelledBy = Boolean(props["aria-labelledby"]);
      if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) {
        console.warn(
          "[Checkbox]: Checkbox must have an accessible name. Provide either:\n" +
            "  - label prop: <Checkbox label='Accept terms' />\n" +
            "  - aria-label: <Checkbox aria-label='Select item' />\n" +
            "  - aria-labelledby for custom label association\n" +
            "  Note: When used inside Checkbox.Group, label is optional",
        );
      }
    }
    const checkboxControl = (
      <BaseCheckbox.Root
        ref={ref}
        data-ui-component="Checkbox"
        name={name}
        checked={checked}
        indeterminate={indeterminate}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-0 bg-ui-base ring after:absolute after:-inset-x-3 after:-inset-y-2 focus:outline-none",
          label && "mt-0.5",
          variant === "error" ? "ring-ui-danger" : "ring-ui-line",
          !disabled &&
            "hover:ring-ui-line focus:ring-2 focus:ring-ui-focus focus-visible:ring-2 focus-visible:ring-ui-brand",
          "data-[checked]:bg-ui-contrast data-[checked]:ring-ui-contrast data-[indeterminate]:bg-ui-contrast data-[indeterminate]:ring-ui-contrast",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        {...props}
      >
        <BaseCheckbox.Indicator
          keepMounted
          className="flex items-center justify-center text-ui-inverse data-[unchecked]:invisible"
          render={(renderProps, state) => (
            <span {...renderProps}>
              {state.indeterminate ? (
                <MinusIcon weight="bold" size={12} />
              ) : (
                <CheckIcon weight="bold" size={12} />
              )}
            </span>
          )}
        />
      </BaseCheckbox.Root>
    );
    // If no label provided, return bare checkbox (for use in other components like Dropdown)
    if (!label) {
      return checkboxControl;
    }
    // Use Field.Root + Field.Label enclosing pattern for proper a11y association
    // See: https://base-ui.com/react/components/field
    return (
      <FieldBase.Root className="inline-flex">
        <FieldBase.Label
          className={cn(
            "!m-0 inline-flex !min-h-0 items-start gap-2 !text-base",
            controlFirst ? "flex-row" : "flex-row-reverse justify-end",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          {checkboxControl}
          <Label
            showOptional={required === false}
            tooltip={labelTooltip}
            asContent
          >
            {label}
          </Label>
        </FieldBase.Label>
      </FieldBase.Root>
    );
  },
);
CheckboxBase.displayName = "Checkbox";
// Checkbox.Item for use within Checkbox.Group
const CheckboxItem = forwardRef<HTMLButtonElement, CheckboxItemProps>(
  (
    {
      className,
      checked,
      indeterminate,
      disabled,
      variant = "default",
      label,
      value,
      onCheckedChange,
      name,
    },
    ref,
  ) => {
    const { controlFirst } = useContext(CheckboxGroupContext);
    return (
      <label
        data-ui-component="Checkbox"
        data-ui-part="item-label"
        className={cn(
          "relative m-0 inline-flex items-start gap-2",
          // Control first (default): checkbox before label
          // Label first: label before checkbox using flex-row-reverse
          !controlFirst && "flex-row-reverse justify-end",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          className,
        )}
      >
        <BaseCheckbox.Root
          ref={ref}
          data-ui-component="Checkbox"
          data-ui-part="item"
          value={value}
          name={name}
          checked={checked}
          indeterminate={indeterminate}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          className={cn(
            "peer relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-0 bg-ui-base ring after:absolute after:-inset-x-3 after:-inset-y-2",
            variant === "error" ? "ring-ui-danger" : "ring-ui-line",
            !disabled &&
              "group-hover:ring-ui-line hover:ring-ui-line focus:ring-2 focus:ring-ui-focus focus-visible:ring-2 focus-visible:ring-ui-brand",
            "data-[checked]:bg-ui-contrast data-[checked]:ring-ui-contrast data-[indeterminate]:bg-ui-contrast data-[indeterminate]:ring-ui-contrast",
          )}
        >
          <BaseCheckbox.Indicator
            keepMounted
            className="flex items-center justify-center text-ui-inverse data-[unchecked]:invisible"
            render={(renderProps, state) => (
              <span {...renderProps}>
                {state.indeterminate ? (
                  <MinusIcon weight="bold" size={12} />
                ) : (
                  <CheckIcon weight="bold" size={12} />
                )}
              </span>
            )}
          />
        </BaseCheckbox.Root>
        <span className="text-base text-ui-default">{label}</span>
      </label>
    );
  },
);
CheckboxItem.displayName = "Checkbox.Item";
// Checkbox.Legend — composable legend sub-component for Checkbox.Group
function CheckboxLegend({ children, className }: CheckboxLegendProps) {
  return (
    <Fieldset.Legend
      className={cn("text-base font-medium text-ui-default", className)}
    >
      {children}
    </Fieldset.Legend>
  );
}
CheckboxLegend.displayName = "Checkbox.Legend";
// Checkbox.Group with built-in Fieldset and CheckboxGroup
function CheckboxGroup({
  legend,
  children,
  error,
  description,
  defaultValue,
  value,
  onValueChange,
  allValues,
  disabled,
  controlFirst = true,
  className,
}: CheckboxGroupProps) {
  return (
    <CheckboxGroupContext.Provider value={{ controlFirst }}>
      <BaseCheckboxGroup
        defaultValue={defaultValue}
        value={value}
        onValueChange={onValueChange}
        allValues={allValues}
        disabled={disabled}
      >
        <Fieldset.Root className={cn("flex flex-col gap-4", className)}>
          {legend && (
            <Fieldset.Legend className="text-base font-medium text-ui-default">
              {legend}
            </Fieldset.Legend>
          )}
          <div className="flex flex-col gap-2">{children}</div>
          {error && <p className="text-sm text-ui-danger">{error}</p>}
          {description && (
            <p className="text-sm text-ui-subtle">{description}</p>
          )}
        </Fieldset.Root>
      </BaseCheckboxGroup>
    </CheckboxGroupContext.Provider>
  );
}
// Compound component
export const Checkbox = Object.assign(CheckboxBase, {
  Item: CheckboxItem,
  Group: CheckboxGroup,
  Legend: CheckboxLegend,
});
Checkbox.displayName = "Checkbox";
