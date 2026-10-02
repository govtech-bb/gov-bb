import { Elevated } from "../surface/elevation";
import { Autocomplete as AutocompleteBase } from "@base-ui/react/autocomplete";
import { ListHighlight, SelectionCheck } from "../animation";
import { createContext, useContext, type ReactNode } from "react";
import { inputVariants, inputStyles, type InputSize } from "../input/input";
import { cn } from "../utils/cn";
import { Field, type FieldErrorMatch } from "../field/field";
const AutocompleteContext = createContext<{
  hasError: boolean;
}>({
  hasError: false,
});
/** Autocomplete variant definitions. */
export type AutocompleteSize = InputSize;
export interface AutocompleteVariantsProps {
  size?: AutocompleteSize;
}
export function autocompleteVariants({
  size = "base",
}: AutocompleteVariantsProps = {}) {
  return cn(inputStyles.size[size] ?? inputStyles.size["base"]);
}
export interface AutocompleteProps {
  /** Array of items to display in the dropdown */
  items: unknown[];
  /** The controlled input value */
  value?: string | number | string[];
  /** The uncontrolled default input value */
  defaultValue?: string | number | string[];
  /** Callback when the input value changes */
  onValueChange?: AutocompleteBase.Root.Props<unknown>["onValueChange"];
  /** Whether the popup is open (controlled) */
  open?: boolean;
  /** Callback when the popup opens or closes */
  onOpenChange?: AutocompleteBase.Root.Props<unknown>["onOpenChange"];
  /** Autocomplete content (input group, popup content) */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Label content (enables Field wrapper) */
  label?: ReactNode;
  /** Whether the field is required */
  required?: boolean;
  /** Tooltip content to display next to the label */
  labelTooltip?: ReactNode;
  /** Helper text displayed below the field */
  description?: ReactNode;
  /** Error message or validation error object */
  error?:
    | string
    | {
        message: ReactNode;
        match: FieldErrorMatch;
      };
}
function Root<ItemValue>({
  label,
  required,
  labelTooltip,
  description,
  error,
  children,
  ...props
}: AutocompleteBase.Root.Props<ItemValue> & {
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
}) {
  const rootProps = props as Omit<
    AutocompleteBase.Root.Props<ItemValue>,
    "items"
  > & {
    items?: readonly ItemValue[];
  };
  const control = (
    <AutocompleteContext.Provider
      value={{
        hasError:
          typeof error === "string" ? Boolean(error) : error?.match === true,
      }}
    >
      <AutocompleteBase.Root {...rootProps}>{children}</AutocompleteBase.Root>
    </AutocompleteContext.Provider>
  );
  if (label != null || description || error) {
    return (
      <Field
        label={label}
        required={required}
        labelTooltip={labelTooltip}
        description={description}
        error={error}
      >
        {control}
      </Field>
    );
  }
  return control;
}
function InputGroup({
  className,
  size = "base",
  placeholder,
}: {
  className?: string;
  size?: AutocompleteSize;
  placeholder?: string;
}) {
  const { hasError } = useContext(AutocompleteContext);
  return (
    <AutocompleteBase.Input
      className={cn(
        inputVariants({
          size,
          variant: hasError ? "error" : "default",
          focusIndicator: true,
        }),
        "w-full",
        className,
      )}
      placeholder={placeholder}
    />
  );
}
function Content({
  children,
  className,
  align = "start",
  sideOffset = 4,
  alignOffset,
  side,
}: {
  children?: ReactNode;
  className?: string;
  align?: AutocompleteBase.Positioner.Props["align"];
  alignOffset?: AutocompleteBase.Positioner.Props["alignOffset"];
  side?: AutocompleteBase.Positioner.Props["side"];
  sideOffset?: AutocompleteBase.Positioner.Props["sideOffset"];
}) {
  return (
    <AutocompleteBase.Portal>
      <AutocompleteBase.Positioner
        className="z-50 outline-none"
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        side={side}
      >
        <AutocompleteBase.Popup
          render={<Elevated offset={2} shadowLevel={3} />}
          className={(state: AutocompleteBase.Popup.State) =>
            cn(
              "ui-popup ui-dropdown-popup flex flex-col",
              "max-h-[min(var(--available-height),24rem)] max-w-(--available-width) min-w-(--anchor-width) py-1.5",
              "text-ui-default",

              state.empty && "hidden",
              className,
            )
          }
        >
          {children}
        </AutocompleteBase.Popup>
      </AutocompleteBase.Positioner>
    </AutocompleteBase.Portal>
  );
}
function List({
  className,
  render,
  ...props
}: AutocompleteBase.List.Props & {
  className?: string;
}) {
  return (
    <AutocompleteBase.List
      {...props}
      render={(listProps, state) => (
        <ListHighlight
          {...listProps}
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
function Item({ children, ...props }: AutocompleteBase.Item.Props) {
  return (
    <AutocompleteBase.Item
      data-ui-component="Autocomplete"
      data-ui-part="item"
      {...props}
      className="group mx-1.5 grid cursor-pointer grid-cols-[1fr_16px] gap-2 rounded px-2 py-1.5 text-base data-highlighted:bg-ui-tint data-selected:font-medium"
    >
      <div className="col-start-1">{children}</div>
      <span
        aria-hidden="true"
        className="col-start-2 flex size-4 items-center self-center"
      >
        <SelectionCheck />
      </span>
    </AutocompleteBase.Item>
  );
}
function GroupLabel(props: AutocompleteBase.GroupLabel.Props) {
  return (
    <AutocompleteBase.GroupLabel
      {...props}
      className={cn(
        "mx-1.5 px-2 py-1.5 text-sm text-ui-default",
        props.className,
      )}
    />
  );
}
function Group(props: AutocompleteBase.Group.Props) {
  return (
    <AutocompleteBase.Group
      {...props}
      className="mt-2 border-t border-ui-hairline pt-2 first:mt-0 first:border-t-0 first:pt-0"
    />
  );
}
function Separator(props: AutocompleteBase.Separator.Props) {
  return (
    <AutocompleteBase.Separator
      {...props}
      className={cn("mx-0 my-1 h-px bg-ui-hairline", props.className)}
    />
  );
}
Root.displayName = "Autocomplete.Root";
InputGroup.displayName = "Autocomplete.InputGroup";
Content.displayName = "Autocomplete.Content";
Item.displayName = "Autocomplete.Item";
GroupLabel.displayName = "Autocomplete.GroupLabel";
Group.displayName = "Autocomplete.Group";
Separator.displayName = "Autocomplete.Separator";
export const Autocomplete = Object.assign(Root, {
  // Styled compound sub-components
  InputGroup,
  Content,
  Item,
  GroupLabel,
  Group,
  Separator,
  List,
  // Pass-through Base UI sub-components
  Empty: AutocompleteBase.Empty,
  Collection: AutocompleteBase.Collection,
  // Filtering
  useFilter: AutocompleteBase.useFilter,
});
