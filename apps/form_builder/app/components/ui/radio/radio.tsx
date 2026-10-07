import {
  forwardRef,
  createContext,
  useContext,
  type ReactNode,
  type ReactElement,
  type ForwardedRef,
} from "react";
import { cn } from "../utils/cn";
import { Fieldset } from "@base-ui/react/fieldset";
import {
  RadioGroup as BaseRadioGroup,
  type RadioGroup as BaseRadioGroupNamespace,
} from "@base-ui/react/radio-group";
import { Radio as BaseRadio } from "@base-ui/react/radio";
/**
 * Event details passed as the second argument to `onValueChange`. Carries the
 * native event and interaction metadata. Re-exported from Base UI.
 */
export type RadioGroupChangeEventDetails =
  BaseRadioGroupNamespace.ChangeEventDetails;
/** Radio variant definitions mapping variant names to their Tailwind classes. */
const radioStyles = {
  variant: {
    default: "ring-ui-line",
    error: "ring-ui-danger",
  },
  appearance: {
    default: "",
    card: "rounded-lg border border-ui-hairline bg-ui-base p-3 transition-colors hover:bg-ui-tint has-[[data-checked]]:border-ui-line has-[[data-checked]]:bg-ui-tint",
  },
} as const;
export type RadioVariant = keyof typeof radioStyles.variant;
export type RadioAppearance = keyof typeof radioStyles.appearance;
export interface RadioVariantsProps {
  /**
   * Visual variant.
   * - `"default"` — Standard radio appearance
   * - `"error"` — Error state for validation failures
   * @default "default"
   */
  variant?: RadioVariant;
  /**
   * Visual appearance.
   * - `"default"` — Standard inline radio item
   * - `"card"` — Choice card with border, padding, and highlighted selection state
   * @default "default"
   */
  appearance?: RadioAppearance;
}
export function radioVariants({
  variant = "default",
  appearance = "default",
}: RadioVariantsProps = {}) {
  return cn(
    radioStyles.variant[variant] ?? radioStyles.variant["default"],
    radioStyles.appearance[appearance] ?? radioStyles.appearance["default"],
  );
}
/** Position of the radio control relative to its label */
export type RadioControlPosition = "start" | "end";
// Context for passing controlPosition and appearance from Group to Items.
// `controlPosition` may be undefined so each item can fall back to an
// appearance-appropriate default (start for default, end for card).
const RadioGroupContext = createContext<{
  controlPosition: RadioControlPosition | undefined;
  appearance: RadioAppearance;
}>({
  controlPosition: undefined,
  appearance: "default",
});
export interface RadioLegendProps {
  /** Legend content */
  children: ReactNode;
  /** Additional CSS classes (e.g. "sr-only" to visually hide the legend) */
  className?: string;
}
export interface RadioGroupProps<Value = string> {
  /**
   * Legend text for the group (required for accessibility).
   * For more control over legend styling, omit this prop and use `<Radio.Legend>` as a child instead.
   */
  legend?: string;
  /** Child Radio.Item components (and optionally a Radio.Legend) */
  children: ReactNode;
  /** Layout direction of the radio items */
  orientation?: "vertical" | "horizontal";
  appearance?: RadioAppearance;
  /** Error message for the group */
  error?: string;
  /** Helper text for the group */
  description?: ReactNode;
  /** Value of the radio that should be initially selected (uncontrolled) */
  defaultValue?: Value;
  /** Value of the radio that should be selected (controlled) */
  value?: Value;
  /**
   * Event handler called when the radio value changes. The second argument
   * carries native event details about the interaction.
   */
  onValueChange?: (
    value: Value,
    eventDetails: RadioGroupChangeEventDetails,
  ) => void;
  /** Whether all radios in the group are disabled */
  disabled?: boolean;
  /** Position of radio control relative to label: "start" puts radio before label, "end" puts label before radio. Defaults to "start" for default appearance and "end" for card appearance. */
  controlPosition?: RadioControlPosition;
  /** Form submission name for the radio group */
  name?: string;
  /** Additional CSS classes */
  className?: string;
}
export type RadioItemProps<Value = string> = {
  /** Visual variant: "default" or "error" for validation failures */
  variant?: RadioVariant;
  appearance?: RadioAppearance;
  /** Label content displayed next to radio (required). Accepts strings or React nodes for rich content. */
  label: ReactNode;
  /** Description text displayed below the label (only visible in card appearance) */
  description?: ReactNode;
  /** Value of the radio (required) */
  value: Value;
  /** Additional CSS classes for the label wrapper */
  className?: string;
  /** Whether the radio is disabled */
  disabled?: boolean;
};
// Radio.Item for use within Radio.Group
function RadioItemRender<T = string>(
  {
    className,
    disabled,
    variant = "default",
    appearance: appearanceProp,
    label,
    description,
    value,
  }: RadioItemProps<T>,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const { controlPosition, appearance: groupAppearance } =
    useContext(RadioGroupContext);
  const appearance = appearanceProp ?? groupAppearance;
  const isCard = appearance === "card";
  // Fall back to an appearance-appropriate default when controlPosition is
  // not provided: card defaults to "end" (radio on the right), default
  // appearance defaults to "start" (radio on the left).
  const effectiveControlPosition: RadioControlPosition =
    controlPosition ?? (isCard ? "end" : "start");
  if (isCard) {
    const controlAtStart = effectiveControlPosition === "start";
    return (
      <label
        data-ui-component="Radio"
        data-ui-part="item-label"
        className={cn(
          "group relative m-0 flex items-start gap-3 rounded-lg border border-ui-hairline bg-ui-base p-3 transition-colors has-[[data-checked]]:border-ui-line has-[[data-checked]]:bg-ui-tint",
          controlAtStart && "flex-row-reverse",
          variant === "error" &&
            "border-ui-danger has-[[data-checked]]:border-ui-danger has-[[data-checked]]:bg-ui-base",
          disabled
            ? "cursor-not-allowed opacity-50"
            : cn(
                "cursor-pointer has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50",
                variant !== "error" &&
                  "hover:not-has-[[data-disabled]]:bg-ui-tint",
              ),
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-medium text-ui-default">{label}</span>
          {description && (
            <span className="text-sm text-ui-subtle">{description}</span>
          )}
        </div>
        <BaseRadio.Root
          ref={ref}
          data-ui-component="Radio"
          data-ui-part="item"
          value={value}
          disabled={disabled}
          className={cn(
            "relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-0 bg-ui-base ring-2 focus:ring-ui-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-brand",
            variant === "error" ? "ring-ui-danger" : "ring-ui-line",
            !disabled &&
              variant !== "error" &&
              "group-hover:ring-ui-line focus-visible:outline-offset-3",
            !disabled &&
              variant === "error" &&
              "focus-visible:outline-offset-3",
          )}
        >
          <BaseRadio.Indicator
            keepMounted
            className="block size-2 shrink-0 rounded-full bg-ui-contrast data-unchecked:invisible"
          />
        </BaseRadio.Root>
      </label>
    );
  }
  return (
    <label
      data-ui-component="Radio"
      data-ui-part="item-label"
      className={cn(
        "group relative m-0 inline-flex items-start gap-2",
        // "start" (default): radio before label
        // "end": label before radio using flex-row-reverse
        effectiveControlPosition === "end" && "flex-row-reverse justify-end",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <BaseRadio.Root
        ref={ref}
        data-ui-component="Radio"
        data-ui-part="item"
        value={value}
        disabled={disabled}
        className={cn(
          "relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-0 bg-ui-base ring after:absolute after:-inset-x-3 after:-inset-y-2 focus:outline-none",
          variant === "error" ? "ring-ui-danger" : "ring-ui-line",
          !disabled &&
            variant !== "error" &&
            "group-hover:ring-ui-line focus:ring-2 focus:ring-ui-focus focus-visible:ring-2 focus-visible:ring-ui-brand focus-visible:outline-offset-3",
          !disabled &&
            variant === "error" &&
            "focus:ring-2 focus:ring-ui-focus focus-visible:ring-2 focus-visible:ring-ui-brand focus-visible:outline-offset-3",
          "data-[checked]:bg-ui-contrast",
        )}
      >
        <BaseRadio.Indicator
          keepMounted
          className="flex items-center justify-center"
        >
          <span className="h-2 w-2 rounded-full bg-ui-base" />
        </BaseRadio.Indicator>
      </BaseRadio.Root>
      <span className="text-base text-ui-default">{label}</span>
    </label>
  );
}
// React's `forwardRef` erases generic type parameters, so we cast the result
// back to a generic call signature. The cast is required to support React 18
// consumers (where function components can't receive `ref` as a plain prop).
const RadioItem = forwardRef(RadioItemRender) as <T = string>(
  props: RadioItemProps<T> & {
    ref?: ForwardedRef<HTMLButtonElement>;
  },
) => ReactElement;
(
  RadioItem as unknown as {
    displayName: string;
  }
).displayName = "Radio.Item";
// Radio.Legend — composable legend sub-component for Radio.Group
function RadioLegend({ children, className }: RadioLegendProps) {
  return (
    <Fieldset.Legend
      className={cn("text-base font-medium text-ui-default", className)}
    >
      {children}
    </Fieldset.Legend>
  );
}
RadioLegend.displayName = "Radio.Legend";
// Radio.Group with built-in Fieldset and RadioGroup
function RadioGroup<Value = string>({
  legend,
  children,
  orientation = "vertical",
  appearance = "default",
  error,
  description,
  defaultValue,
  value,
  onValueChange,
  disabled,
  controlPosition,
  name,
  className,
}: RadioGroupProps<Value>) {
  return (
    <RadioGroupContext.Provider value={{ controlPosition, appearance }}>
      <BaseRadioGroup<Value>
        defaultValue={defaultValue}
        value={value}
        onValueChange={(newValue, eventDetails) =>
          onValueChange?.(newValue, eventDetails)
        }
        disabled={disabled}
        name={name}
      >
        <Fieldset.Root
          disabled={disabled}
          className={cn("@container/radio flex flex-col gap-4", className)}
        >
          {legend && (
            <Fieldset.Legend className="text-base font-medium text-ui-default">
              {legend}
            </Fieldset.Legend>
          )}
          <div
            className={cn(
              orientation === "vertical"
                ? cn("flex flex-col", appearance === "card" ? "gap-3" : "gap-2")
                : appearance === "card"
                  ? "grid grid-cols-1 gap-3 @sm/radio:grid-cols-2"
                  : "flex flex-row flex-wrap gap-2",
            )}
          >
            {children}
          </div>
          {error && <p className="text-sm text-ui-danger">{error}</p>}
          {description && (
            <p className="text-sm text-ui-subtle">{description}</p>
          )}
        </Fieldset.Root>
      </BaseRadioGroup>
    </RadioGroupContext.Provider>
  );
}
RadioGroup.displayName = "Radio.Group";
// Export RadioGroup directly for external usage
export { RadioGroup };
export const Radio = Object.assign(RadioGroup, {
  Item: RadioItem,
  Group: RadioGroup,
  Legend: RadioLegend,
});
