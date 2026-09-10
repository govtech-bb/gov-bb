import { Elevated } from "../surface/elevation";
import { Select as SelectBase } from "@base-ui/react/select";
import { CaretUpDownIcon } from "@phosphor-icons/react";
import { forwardRef } from "react";
import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import { ListHighlight, SelectionCheck } from "../animation";
import { inputVariants, type InputSize } from "../input/input";
import { SkeletonLine } from "../loader";
import { Label } from "../label";
import { Field, type FieldErrorMatch } from "../field/field";
import {
  usePortalContainer,
  type PortalContainer,
} from "../utils/portal-provider";
/** Select variant definitions. */
export type SelectSize = InputSize;
export interface SelectVariantsProps {
  size?: SelectSize;
}
/** Base UI positioning controls forwarded to Select's popup. */
type SelectPositionerProps = Pick<
  SelectBase.Positioner.Props,
  | "align"
  | "alignItemWithTrigger"
  | "alignOffset"
  | "anchor"
  | "arrowPadding"
  | "collisionAvoidance"
  | "collisionBoundary"
  | "collisionPadding"
  | "disableAnchorTracking"
  | "positionMethod"
  | "side"
  | "sideOffset"
  | "sticky"
>;
export function selectVariants({ size = "base" }: SelectVariantsProps = {}) {
  return cn(
    inputVariants({ size }),
    "group flex w-full min-w-0 items-center justify-between font-normal select-none cursor-pointer",
  );
}

const triggerIconStyles: Record<
  InputSize,
  {
    iconSize: number;
    className: string;
  }
> = {
  xs: { iconSize: 12, className: "text-ui-subtle" },
  sm: { iconSize: 14, className: "text-ui-subtle" },
  base: { iconSize: 16, className: "text-ui-subtle" },
  lg: { iconSize: 18, className: "text-ui-subtle" },
};
/**
 * Shape for items that carry extra metadata (disabled state, tooltip).
 * Plain `ReactNode` values are still supported for backward compatibility.
 */
export interface SelectItemDescriptor {
  /** Display label for the option. */
  label: ReactNode;
  /** When `true`, the option cannot be selected. */
  disabled?: boolean;
}
/** Value type accepted by the `items` object-map prop. */
export type SelectItemValue = ReactNode | SelectItemDescriptor;
function isItemDescriptor(
  value: SelectItemValue,
): value is SelectItemDescriptor {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  // React elements have $$typeof — exclude them
  if ("$$typeof" in (value as object)) return false;
  // Promises are not descriptors
  if (value instanceof Promise) return false;
  // Must have a defined label (not just the key existing)
  const candidate = value as unknown as Record<string, unknown>;
  return "label" in candidate && candidate.label !== undefined;
}
/**
 * Normalizes items to array format for Base UI.
 * Object maps are converted to array format so Base UI can properly
 * handle value matching and placeholder display.
 */
export type SelectItem<T> = { label: ReactNode; value: T; disabled?: boolean };
function normalizeItems<T>(
  items: Record<string, SelectItemValue> | ReadonlyArray<SelectItem<T>>,
): ReadonlyArray<SelectItem<T>> {
  if (Array.isArray(items)) {
    return items;
  }
  // Convert object map to array format
  return Object.entries(items).map(([key, entry]) => ({
    value: key as T,
    label: isItemDescriptor(entry) ? entry.label : entry,
    disabled: isItemDescriptor(entry) ? entry.disabled : undefined,
  }));
}
/**
 * Auto-generates Select.Option elements from items prop.
 * Only used when children are not explicitly provided.
 * Filters out null values (typically used for placeholders).
 */
export type SelectProps<T, Multiple extends boolean | undefined = false> = Omit<
  SelectBase.Root.Props<T, Multiple>,
  "items"
> &
  SelectVariantsProps &
  Pick<
    SelectBase.Trigger.Props,
    "id" | "aria-label" | "aria-labelledby" | "aria-describedby"
  > & {
    multiple?: Multiple;
    renderValue?: (value: Multiple extends true ? T[] : T) => ReactNode;
    /** Replaces the trigger element while preserving Select behavior. */
    render?: SelectBase.Trigger.Props["render"];
    className?: string;
    items?: Record<string, SelectItemValue> | ReadonlyArray<SelectItem<T>>;
    /**
     * Label content for the select.
     * When provided, enables the Field wrapper with a visible label.
     * For accessibility without a visible label, use `aria-label` instead.
     */
    label?: ReactNode;
    hideLabel?: boolean;
    placeholder?: string;
    loading?: boolean;
    /** Tooltip content to display next to the label via an info icon */
    labelTooltip?: ReactNode;
    /** Helper text displayed below the select */
    description?: ReactNode;
    /** Error message or validation error object */
    error?:
      | string
      | {
          message: ReactNode;
          match: FieldErrorMatch;
        };
    container?: PortalContainer;
    finalFocus?: SelectBase.Popup.Props["finalFocus"];
  } & SelectPositionerProps;
export interface SelectOptionProps {
  /** The option content. */
  children: ReactNode;
  /** The value associated with this option. */
  value: unknown;
  /** When `true`, the option cannot be selected. */
  disabled?: boolean;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
}
export function Select<T, Multiple extends boolean | undefined = false>({
  id,
  children,
  className,
  render,
  renderValue,
  label,
  hideLabel,
  placeholder,
  loading,
  size = "base",
  labelTooltip,
  description,
  error,
  required,
  container: containerProp,
  finalFocus,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset,
  alignItemWithTrigger = false,
  anchor,
  arrowPadding,
  positionMethod,
  collisionAvoidance,
  collisionBoundary,
  collisionPadding,
  sticky,
  disableAnchorTracking,
  ...props
}: SelectProps<T, Multiple> & {
  required?: boolean;
}) {
  const contextContainer = usePortalContainer();
  const container = containerProp ?? contextContainer ?? undefined;
  // Normalize items to array format for Base UI compatibility
  // This fixes placeholder not showing with object map items
  const normalizedItems = props.items ? normalizeItems(props.items) : undefined;
  const renderedChildren =
    children ??
    normalizedItems
      ?.filter((item) => item.value !== null)
      .map((item, index) => (
        <Option
          key={typeof item.value === "string" ? item.value : index}
          value={item.value}
          disabled={item.disabled}
        >
          {item.label}
        </Option>
      ));

  // Wrap renderValue to handle null values properly:
  // - When value is null, show placeholder (Base UI ignores placeholder when children fn provided)
  // - When value is non-null, call user's renderValue
  const valueChildrenFn = renderValue
    ? (value: unknown) => {
        const placeholderNode =
          placeholder != null ? (
            <span className="text-ui-placeholder">{placeholder}</span>
          ) : null;
        if (value == null || value === "") {
          return placeholderNode;
        }
        // Cast through `any` as a deliberate type boundary: Base UI passes `unknown`,
        // but our renderValue expects the generic T (or T[] for multiple)
        const rendered = renderValue(
          value as Parameters<NonNullable<typeof renderValue>>[0],
        );
        if (rendered == null) {
          return placeholderNode;
        }
        return rendered;
      }
    : undefined;
  // Exclude Extended `items` from Base UI spread — we pass `normalizedItems` instead
  const {
    items: _items,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    ...baseProps
  } = props;
  // Use Base UI's Select.Label for accessible naming — avoids the
  // hover/focus coupling that a native <label> (from Field) would cause.
  const showOptional = required === false;
  const selectLabelNode = label ? (
    <SelectBase.Label
      className={cn(
        "m-0 text-base font-medium text-ui-default",
        hideLabel && "sr-only",
      )}
    >
      <Label
        showOptional={showOptional}
        tooltip={hideLabel ? undefined : labelTooltip}
        asContent
      >
        {label}
      </Label>
    </SelectBase.Label>
  ) : null;
  const selectTrigger = (
    <SelectBase.Trigger
      id={id}
      data-ui-component="Select"
      data-ui-part="trigger"
      render={render}
      className={cn(
        selectVariants({ size }),
        props.disabled && "cursor-not-allowed opacity-50",

        className,
      )}
      {...(ariaLabel !== undefined && { "aria-label": ariaLabel })}
      {...(ariaLabelledBy !== undefined && {
        "aria-labelledby": ariaLabelledBy,
      })}
      {...(ariaDescribedBy !== undefined && {
        "aria-describedby": ariaDescribedBy,
      })}
    >
      {loading ? (
        <SkeletonLine className="w-32" />
      ) : (
        <SelectBase.Value
          placeholder={placeholder}
          className="min-w-0 truncate data-[placeholder]:text-ui-placeholder"
        >
          {valueChildrenFn}
        </SelectBase.Value>
      )}
      <SelectBase.Icon
        className={cn(
          "flex shrink-0 items-center",
          triggerIconStyles[size].className,
        )}
      >
        <CaretUpDownIcon
          size={triggerIconStyles[size].iconSize}
          className="fill-current"
        />
      </SelectBase.Icon>
    </SelectBase.Trigger>
  );
  const selectControl = (
    <SelectBase.Root
      {...baseProps}
      items={normalizedItems}
      disabled={loading || props.disabled}
      required={required}
    >
      {selectLabelNode}
      {selectTrigger}
      <SelectBase.Portal container={container}>
        {/*
          Anchor to `side` (default `bottom`) rather than Base UI's default
          `alignItemWithTrigger`, which overlays the popup on the trigger to
          emulate a native `<select>`. Collision avoidance still flips the popup
          automatically when the preferred side lacks space, and consumers can
          pin placement explicitly via `side` / `align`, or opt back into the
          native overlay with `alignItemWithTrigger`.
        */}
        <SelectBase.Positioner
          className="z-50"
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          alignItemWithTrigger={alignItemWithTrigger}
          anchor={anchor}
          arrowPadding={arrowPadding}
          positionMethod={positionMethod}
          collisionAvoidance={collisionAvoidance}
          collisionBoundary={collisionBoundary}
          collisionPadding={collisionPadding}
          sticky={sticky}
          disableAnchorTracking={disableAnchorTracking}
        >
          <SelectBase.Popup
            finalFocus={finalFocus}
            render={<Elevated offset={2} shadowLevel={3} />}
            className={cn(
              "ui-popup ui-dropdown-popup flex flex-col",
              "max-h-[var(--available-height)] text-ui-default",

              "max-w-(--available-width) min-w-(--anchor-width) py-1.5",
            )}
          >
            <SelectBase.List
              render={
                <ListHighlight
                  selection={props.multiple ? undefined : "single"}
                  className="ui-option-list"
                />
              }
              className={cn(
                "min-h-0 flex-1 scroll-pt-2 scroll-pb-2 ui-scroll-native overflow-y-auto overscroll-none",
              )}
            >
              {renderedChildren}
            </SelectBase.List>
          </SelectBase.Popup>
        </SelectBase.Positioner>
      </SelectBase.Portal>
    </SelectBase.Root>
  );
  return label != null || description || error ? (
    <Field
      label={label}
      required={required}
      description={description}
      error={error}
      hideLabel
    >
      {selectControl}
    </Field>
  ) : (
    selectControl
  );
}

type OptionProps<T> = {
  children: ReactNode;
  value: T;
  /** When `true`, the option cannot be selected. */
  disabled?: boolean;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
};
function Option<T>({ children, value, disabled, className }: OptionProps<T>) {
  return (
    <SelectBase.Item
      data-ui-component="Select"
      data-ui-part="option"
      value={value}
      disabled={disabled}
      className={cn(
        "group mx-1.5 flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-base outline-none",
        "focus-visible:z-50 focus-visible:ring-2 focus-visible:ring-ui-brand focus-visible:ring-inset",
        "data-highlighted:bg-ui-tint",
        "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
    >
      <SelectBase.ItemText>{children}</SelectBase.ItemText>
      <SelectBase.ItemIndicator
        keepMounted
        aria-hidden="true"
        className="size-4 shrink-0"
      >
        <SelectionCheck />
      </SelectBase.ItemIndicator>
    </SelectBase.Item>
  );
}
// --- Select.Group ---
type GroupProps = {
  children: ReactNode;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
};
const Group = forwardRef<HTMLDivElement, GroupProps>(
  ({ children, className }, ref) => (
    <SelectBase.Group ref={ref} className={cn(className)}>
      {children}
    </SelectBase.Group>
  ),
);
Group.displayName = "Select.Group";
// --- Select.GroupLabel ---
type GroupLabelProps = {
  children: ReactNode;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
};
const GroupLabel = forwardRef<HTMLDivElement, GroupLabelProps>(
  ({ children, className }, ref) => (
    <SelectBase.GroupLabel
      ref={ref}
      className={cn(
        "px-3.5 py-1.5 text-sm font-semibold text-ui-subtle",
        className,
      )}
    >
      {children}
    </SelectBase.GroupLabel>
  ),
);
GroupLabel.displayName = "Select.GroupLabel";
// --- Select.Separator ---
type SeparatorProps = {
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
};
const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className }, ref) => (
    <SelectBase.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-ui-hairline", className)}
    />
  ),
);
Separator.displayName = "Select.Separator";
// --- Assign sub-components ---
Select.Option = Option;
Select.Group = Group;
Select.GroupLabel = GroupLabel;
Select.Separator = Separator;
(
  Select.Option as {
    displayName?: string;
  }
).displayName = "Select.Option";
