import { Elevated } from "../surface/elevation";
import { Combobox as ComboboxBase } from "@base-ui/react/combobox";
import { CaretUpDownIcon, XIcon } from "@phosphor-icons/react";
import {
  Fragment,
  createContext,
  useContext,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { inputVariants, inputStyles, type InputSize } from "../input/input";
import { cn } from "../utils/cn";
import { ListHighlight, SelectionCheck } from "../animation";
import { Field, type FieldErrorMatch } from "../field/field";
import {
  usePortalContainer,
  type PortalContainer,
} from "../utils/portal-provider";
/** Combobox variant definitions. */
const comboboxStyles = {
  size: inputStyles.size,
  inputSide: {
    right: "",
    top: "",
  },
} as const;
// Context to pass size and error state down to sub-components
const ComboboxContext = createContext<{
  size: InputSize;
  hasError: boolean;
  multiple: boolean;
}>({ size: "base", hasError: false, multiple: false });
export type ComboboxSize = keyof typeof comboboxStyles.size;
export type ComboboxInputSide = keyof typeof comboboxStyles.inputSide;
export interface ComboboxVariantsProps {
  size?: ComboboxSize;
  /**
   * Position of the text input relative to chips in multi-select mode.
   * - `"right"` — Input inline to the right of chips
   * - `"top"` — Input above chips
   * @default "right"
   */
  inputSide?: ComboboxInputSide;
}
export function comboboxVariants({
  inputSide = "right",
}: ComboboxVariantsProps = {}) {
  return cn(
    comboboxStyles.inputSide[inputSide] ?? comboboxStyles.inputSide["right"],
  );
}
export type ComboboxRootProps<
  Value = unknown,
  Multiple extends boolean | undefined = false,
> = ComboboxBase.Root.Props<Value, Multiple>;
export interface ComboboxProps extends ComboboxVariantsProps {
  /** Array of items to display in the dropdown */
  items: unknown[];
  /** Currently selected value(s) */
  value?: unknown;
  /** Callback when selection changes */
  onValueChange?: (value: unknown) => void;
  /** Enable multi-select mode */
  multiple?: boolean;
  /** Combobox content (trigger, content, items) */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Label content for the combobox (enables Field wrapper) - can be a string or any React node */
  label?: ReactNode;
  /** Whether the combobox is required */
  required?: boolean;
  /** Tooltip content to display next to the label via an info icon */
  labelTooltip?: ReactNode;
  /** Helper text displayed below the combobox */
  description?: ReactNode;
  /** Error message or validation error object */
  error?:
    | string
    | {
        message: ReactNode;
        match: FieldErrorMatch;
      };
}
function Root<Value, Multiple extends boolean | undefined = false>({
  label,
  required,
  labelTooltip,
  description,
  error,
  children,
  size = "base",
  ...props
}: ComboboxBase.Root.Props<Value, Multiple> & {
  label?: ReactNode;
  required?: boolean;
  labelTooltip?: ReactNode;
  description?: ReactNode;
  error?:
    | string
    | {
        message: ReactNode;
        match: FieldErrorMatch;
      };
  size?: ComboboxSize;
}) {
  const comboboxControl = (
    <ComboboxContext.Provider
      value={{
        size,
        hasError:
          typeof error === "string" ? Boolean(error) : error?.match === true,
        multiple: Boolean(props.multiple),
      }}
    >
      <ComboboxBase.Root {...props} required={required}>
        {children}
      </ComboboxBase.Root>
    </ComboboxContext.Provider>
  );
  // Render with Field wrapper if label, description, or error are provided
  if (label != null || description || error) {
    return (
      <Field
        label={label}
        required={required}
        labelTooltip={labelTooltip}
        description={description}
        error={error}
      >
        {comboboxControl}
      </Field>
    );
  }
  // Render bare combobox without Field wrapper
  return comboboxControl;
}
function Content({
  children,
  className,
  align = "start",
  sideOffset = 4,
  alignOffset,
  side,
  anchor,
  positionMethod,
  collisionAvoidance,
  collisionBoundary,
  collisionPadding,
  sticky,
  disableAnchorTracking,
  container: containerProp,
}: PropsWithChildren<{
  className?: string;
  align?: ComboboxBase.Positioner.Props["align"];
  alignOffset?: ComboboxBase.Positioner.Props["alignOffset"];
  side?: ComboboxBase.Positioner.Props["side"];
  sideOffset?: ComboboxBase.Positioner.Props["sideOffset"];
  anchor?: ComboboxBase.Positioner.Props["anchor"];
  positionMethod?: ComboboxBase.Positioner.Props["positionMethod"];
  collisionAvoidance?: ComboboxBase.Positioner.Props["collisionAvoidance"];
  collisionBoundary?: ComboboxBase.Positioner.Props["collisionBoundary"];
  collisionPadding?: ComboboxBase.Positioner.Props["collisionPadding"];
  sticky?: ComboboxBase.Positioner.Props["sticky"];
  disableAnchorTracking?: ComboboxBase.Positioner.Props["disableAnchorTracking"];
  container?: PortalContainer;
}>) {
  const contextContainer = usePortalContainer();
  const container = containerProp ?? contextContainer ?? undefined;
  return (
    <ComboboxBase.Portal container={container}>
      <ComboboxBase.Positioner
        className="z-50"
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        side={side}
        anchor={anchor}
        positionMethod={positionMethod}
        collisionAvoidance={collisionAvoidance}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        sticky={sticky}
        disableAnchorTracking={disableAnchorTracking}
      >
        <ComboboxBase.Popup
          render={<Elevated offset={2} shadowLevel={3} />}
          className={cn(
            "ui-popup ui-dropdown-popup flex flex-col", // flexbox layout for sticky input + scrollable list
            "max-h-[min(var(--available-height),24rem)] max-w-(--available-width) min-w-(--anchor-width) py-1.5",
            "text-ui-default", // background
            // border part
            className,
          )}
        >
          {children}
        </ComboboxBase.Popup>
      </ComboboxBase.Positioner>
    </ComboboxBase.Portal>
  );
}
// Size-dependent styles for TriggerValue icon
const triggerValueIconStyles: Record<
  ComboboxSize,
  {
    padding: string;
    iconSize: number;
    iconRight: string;
  }
> = {
  xs: { padding: "pr-5", iconSize: 12, iconRight: "right-1" },
  sm: { padding: "pr-6", iconSize: 14, iconRight: "right-1.5" },
  base: { padding: "pr-8", iconSize: 16, iconRight: "right-2" },
  lg: { padding: "pr-10", iconSize: 18, iconRight: "right-3" },
};
function TriggerValue({
  className,
  render,
  ...props
}: ComboboxBase.Value.Props & {
  className?: string;
  /** Replaces the trigger element while preserving Combobox behavior. */
  render?: ComboboxBase.Trigger.Props["render"];
}) {
  const { size, hasError } = useContext(ComboboxContext);
  const iconStyles = triggerValueIconStyles[size];
  return (
    <ComboboxBase.Trigger
      data-ui-component="Combobox"
      data-ui-part="trigger"
      render={render}
      className={cn(
        inputVariants({ size, variant: hasError ? "error" : "default" }),
        "relative flex items-center",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        "data-[placeholder]:text-ui-placeholder",
        iconStyles.padding,
        className,
      )}
    >
      <ComboboxBase.Value {...props} />
      <ComboboxBase.Icon
        className={cn(
          "absolute top-1/2 flex -translate-y-1/2 items-center text-ui-subtle",
          iconStyles.iconRight,
        )}
      >
        <CaretUpDownIcon size={iconStyles.iconSize} className="fill-current" />
      </ComboboxBase.Icon>
    </ComboboxBase.Trigger>
  );
}
// Size-dependent styles for TriggerInput icons
const triggerInputIconStyles: Record<
  ComboboxSize,
  {
    padding: string;
    iconSize: number;
    clearRight: string;
    caretRight: string;
  }
> = {
  xs: {
    padding: "pr-7",
    iconSize: 12,
    clearRight: "right-5",
    caretRight: "right-1",
  },
  sm: {
    padding: "pr-9",
    iconSize: 14,
    clearRight: "right-6",
    caretRight: "right-1.5",
  },
  base: {
    padding: "pr-12",
    iconSize: 16,
    clearRight: "right-8",
    caretRight: "right-2",
  },
  lg: {
    padding: "pr-14",
    iconSize: 18,
    clearRight: "right-9",
    caretRight: "right-3",
  },
};
function TriggerInput({
  clearLabel = "Clear selection",
  showOptionsLabel = "Show options",
  ...props
}: ComboboxBase.Input.Props & {
  /** Accessible label for the clear button. Pass a translated string for i18n.
   * @default "Clear selection"
   */
  clearLabel?: string;
  /** Accessible label for the dropdown trigger. Pass a translated string for i18n.
   * @default "Show options"
   */
  showOptionsLabel?: string;
}) {
  const { size, hasError } = useContext(ComboboxContext);
  const iconStyles = triggerInputIconStyles[size];
  return (
    <div
      className={cn(
        "relative inline-block w-full",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        props.className,
      )}
    >
      <ComboboxBase.Input
        {...(props["aria-label"] !== undefined && {
          "aria-labelledby": undefined,
        })}
        {...props}
        className={cn(
          inputVariants({ size, variant: hasError ? "error" : "default" }),
          "w-full",
          iconStyles.padding,
          "disabled:cursor-not-allowed",
        )}
      />

      <ComboboxBase.Clear
        data-ui-component="Combobox"
        data-ui-part="clear"
        aria-label={clearLabel}
        className={cn(
          "absolute top-1/2 flex -translate-y-1/2 cursor-pointer bg-transparent p-0",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-0",
          iconStyles.clearRight,
        )}
      >
        <XIcon size={iconStyles.iconSize} />
      </ComboboxBase.Clear>

      <ComboboxBase.Trigger
        data-ui-component="Combobox"
        data-ui-part="trigger"
        aria-label={showOptionsLabel}
        className={cn(
          "absolute top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center text-ui-subtle",
          "m-0 bg-transparent p-0", // Reset Stratus global button styles
          iconStyles.caretRight,
        )}
      >
        <ComboboxBase.Icon className="flex items-center">
          <CaretUpDownIcon
            size={iconStyles.iconSize}
            className="fill-current"
          />
        </ComboboxBase.Icon>
      </ComboboxBase.Trigger>
    </div>
  );
}
function Item({
  children,
  className,
  ...props
}: ComboboxBase.Item.Props & {
  className?: string;
}) {
  return (
    <ComboboxBase.Item
      data-ui-component="Combobox"
      data-ui-part="item"
      {...props}
      className={cn(
        "group mx-1.5 grid grid-cols-[1fr_16px] gap-2 rounded px-2 py-1.5 text-base",
        "cursor-pointer data-highlighted:bg-ui-tint",
        // Disabled rows: muted text, no pointer, suppress highlight bg even
        // when keyboard nav lands on them. Base UI sets `data-disabled` on
        // the element when the `disabled` prop is true.
        "data-[disabled]:cursor-not-allowed data-[disabled]:text-ui-subtle data-[disabled]:opacity-60 data-[disabled]:data-highlighted:bg-transparent",
        className,
      )}
    >
      <div className="col-start-1">{children}</div>
      <ComboboxBase.ItemIndicator
        keepMounted
        className="col-start-2 flex size-4 items-center self-center"
      >
        <SelectionCheck />
      </ComboboxBase.ItemIndicator>
    </ComboboxBase.Item>
  );
}
function Empty(props: ComboboxBase.Empty.Props) {
  return (
    <ComboboxBase.Empty
      {...props}
      className={cn(
        "mx-1.5 shrink-0 px-4 py-2 text-[0.925rem] leading-4 text-ui-subtle empty:m-0 empty:p-0",
      )}
      children={props.children ?? "No labels found."}
    />
  );
}
function Input(props: ComboboxBase.Input.Props) {
  return (
    <ComboboxBase.Input
      {...(props["aria-label"] !== undefined && {
        "aria-labelledby": undefined,
      })}
      {...props}
      className={cn(
        inputVariants(),
        "mx-0 -mt-1.5 w-full shrink-0 rounded-b-none first:mb-2",
        props.className,
      )}
    />
  );
}
function List({
  className,
  render,
  ...props
}: ComboboxBase.List.Props & {
  className?: string;
}) {
  const { multiple } = useContext(ComboboxContext);
  return (
    <ComboboxBase.List
      {...props}
      render={(listProps, state) => (
        <ListHighlight
          {...listProps}
          className={cn("ui-option-list", listProps.className)}
          selection={multiple ? undefined : "single"}
          render={
            typeof render === "function"
              ? (listProps) => render(listProps, state)
              : render
          }
        />
      )}
      className={cn(
        "min-h-0 flex-1 scroll-pt-2 scroll-pb-2 ui-scroll-native overflow-y-auto overscroll-contain",
        className,
      )}
    />
  );
}
function GroupLabel(props: ComboboxBase.GroupLabel.Props) {
  return (
    <ComboboxBase.GroupLabel
      {...props}
      className={cn(
        "mx-1.5 px-2 py-1.5 text-sm text-ui-subtle",
        props.className,
      )}
    />
  );
}
function Group(props: ComboboxBase.Group.Props) {
  return (
    <ComboboxBase.Group
      {...props}
      className="mt-2 border-t border-ui-hairline pt-2 first:mt-0 first:border-t-0 first:pt-0"
    />
  );
}
function Chip({
  removeLabel = "Remove",
  ...props
}: ComboboxBase.Chip.Props & {
  /** Accessible label for the chip remove button. Pass a translated string for i18n.
   * @default "Remove"
   */
  removeLabel?: string;
}) {
  return (
    <ComboboxBase.Chip
      {...props}
      className={cn(
        "flex items-center gap-2.5", // Layout
        "h-6 pr-[3px] pl-2", // Dimensions
        "rounded-sm ring-1 ring-ui-hairline", // Border
        "bg-ui-tint", // Background
        "text-sm",
      )}
    >
      {props.children}
      <ComboboxBase.ChipRemove
        data-ui-component="Combobox"
        data-ui-part="chip-remove"
        aria-label={removeLabel}
        className={cn(
          "cursor-pointer rounded-md p-1 hover:bg-ui-control-hover",
          "flex bg-transparent",
        )}
      >
        <XIcon size={10} />
      </ComboboxBase.ChipRemove>
    </ComboboxBase.Chip>
  );
}
// Map size to min-height class for TriggerMultipleWithInput
const sizeToMinHeight: Record<ComboboxSize, string> = {
  xs: "min-h-5",
  sm: "min-h-6.5",
  base: "min-h-9",
  lg: "min-h-10",
};
function TriggerMultipleWithInput<ValueType>({
  placeholder,
  renderItem,
  className,
  inputSide = "right",
  value: controlledValue,
}: {
  placeholder?: string;
  renderItem: (value: ValueType) => React.ReactNode;
  className?: string;
  inputSide?: "right" | "top";
  /** Optional controlled value for rendering chips (use when pre-selecting values) */
  value?: ValueType[];
}) {
  const { size, hasError } = useContext(ComboboxContext);
  // Determine which value to use for rendering chips
  const chipsToRender = controlledValue;
  const renderTriggerInput = (className: string) => (
    <ComboboxBase.Input placeholder={placeholder} className={className} />
  );
  return (
    <ComboboxBase.Chips
      className={cn(
        inputVariants({ size, variant: hasError ? "error" : "default" }),
        "flex flex-col",
        "gap-1 px-1.5 py-1",
        sizeToMinHeight[size],
        "h-auto",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
    >
      {inputSide === "top" &&
        renderTriggerInput("w-full border-0 bg-inherit px-2 py-1")}
      {/* Chips container */}
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {/* Render chips from controlled value if provided */}
        {chipsToRender !== undefined &&
          chipsToRender.length > 0 &&
          chipsToRender.map((item) => renderItem(item))}
        {/* Also render from BaseUI's internal value for user selections */}
        <ComboboxBase.Value>
          {(internalValue: ValueType[]) => {
            // Skip rendering if using controlled value (to avoid duplicates)
            if (chipsToRender !== undefined) return null;
            return (
              <Fragment>
                {internalValue.map((item) => renderItem(item))}
              </Fragment>
            );
          }}
        </ComboboxBase.Value>
        {inputSide === "right" &&
          renderTriggerInput(
            "min-w-[100px] flex-1 border-0 bg-inherit px-2 py-1",
          )}
      </div>
    </ComboboxBase.Chips>
  );
}
Root.displayName = "Combobox.Root";
Content.displayName = "Combobox.Content";
TriggerValue.displayName = "Combobox.TriggerValue";
TriggerInput.displayName = "Combobox.TriggerInput";
Item.displayName = "Combobox.Item";
Chip.displayName = "Combobox.Chip";
TriggerMultipleWithInput.displayName = "Combobox.TriggerMultipleWithInput";
export const Combobox = Object.assign(Root, {
  // Helper components
  Content,
  TriggerValue,
  TriggerInput,
  TriggerMultipleWithInput,
  // Slightly modified BaseUI
  Chip,
  Item,
  // Styled BaseUI
  Input,
  Empty,
  GroupLabel,
  Group,
  // Styled BaseUI
  List,
  // BaseUI
  Collection: ComboboxBase.Collection,
  Trigger: ComboboxBase.Trigger,
  Value: ComboboxBase.Value,
  Icon: ComboboxBase.Icon,
  // Filtering
  useFilter: ComboboxBase.useFilter,
  createItems: ComboboxBase.createItems,
});
