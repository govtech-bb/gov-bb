import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { CaretDown, Check, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { pillChevron, pillIcon, type PillTone } from "./pill";
import { SearchRow } from "./search-row";
import { selectTrigger, type SelectSize } from "./select";
import {
  fieldList,
  fieldPopup,
  group,
  groupLabel,
  listEmpty,
  row,
  rowCheck,
  rowIcon,
  rowLabel,
} from "./surface";

// A control inside a pill reaches past what it shows, to 44px under a coarse pointer
const reach = "relative after:absolute after:-inset-2 pointer-coarse:after:-inset-3.5";

type TriggerProps = Omit<BaseCombobox.Trigger.Props, "className" | "children"> & {
  /**
   * A field or a pill, as Select's. Inline has no frame of its own, for a trigger inside a Pill that holds something
   * else too, such as a typed value or a Clear.
   */
  look?: "field" | "pill" | "inline";
  size?: SelectSize;
  /** A pill's tone. */
  tone?: PillTone;
  /** The chosen item's icon, before its label. */
  icon?: ReactNode;
  placeholder?: ReactNode;
  className?: string;
  /** In place of the chosen item's label; null leaves the caret alone. */
  children?: ReactNode;
};

/** The button that shows what's chosen, by the root's itemToStringLabel, and opens the list. */
function ComboboxTrigger({
  look = "field",
  size,
  tone,
  icon,
  placeholder,
  className,
  children,
  ...props
}: TriggerProps) {
  return (
    <BaseCombobox.Trigger
      {...props}
      className={cn(
        look === "inline"
          ? cn("inline-flex min-w-0 cursor-pointer items-center gap-1.5 outline-none", reach)
          : selectTrigger(look, size, tone),
        className,
      )}
    >
      {icon && <span className={look === "field" ? rowIcon : pillIcon}>{icon}</span>}
      <span className={cn("min-w-0 truncate leading-normal", look === "field" && "flex-1")}>
        {children === undefined ? (
          <BaseCombobox.Value
            placeholder={<span className="text-placeholder">{placeholder}</span>}
          />
        ) : (
          children
        )}
      </span>
      <span aria-hidden="true" className={pillChevron}>
        <CaretDown />
      </span>
    </BaseCombobox.Trigger>
  );
}

type ContentProps = Pick<
  BaseCombobox.Positioner.Props,
  "anchor" | "side" | "align" | "sideOffset" | "alignOffset"
> &
  Pick<BaseCombobox.Popup.Props, "initialFocus" | "finalFocus"> & {
    /** A search box over the list, with these words as its placeholder and name. It filters as the root does. */
    search?: string;
    /** Shown when nothing matches the search. */
    empty?: ReactNode;
    /** Under the list, outside its scroll, such as a way to add what wasn't found. */
    footer?: ReactNode;
    /** Its items, or a function that draws each of the root's items or groups. */
    children: BaseCombobox.List.Props["children"];
  };

/**
 * The list in its portal, at least as wide as its trigger, or `anchor`ed elsewhere, such as the pill a trigger sits in.
 * It grows out of its trigger as a select's list does.
 */
function ComboboxContent({
  search,
  empty,
  footer,
  initialFocus,
  finalFocus,
  children,
  ...placement
}: ContentProps) {
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner
        align="start"
        sideOffset={6}
        collisionPadding={8}
        {...placement}
        className="z-popup outline-none"
      >
        <BaseCombobox.Popup
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className={fieldPopup}
        >
          {search !== undefined && (
            <SearchRow render={<BaseCombobox.Input />} aria-label={search} placeholder={search} />
          )}
          <BaseCombobox.Empty className={listEmpty}>{empty}</BaseCombobox.Empty>
          <BaseCombobox.List className={cn(fieldList, "data-empty:p-0")}>
            {children}
          </BaseCombobox.List>
          {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  );
}

/** Items that belong together, under an optional heading, ruled off from the next group. */
function ComboboxGroup({
  label,
  items,
  children,
}: {
  label?: ReactNode;
  /** The group's own items, which `children` draws one by one. */
  items: BaseCombobox.Group.Props["items"];
  children: BaseCombobox.Collection.Props["children"];
}) {
  return (
    <BaseCombobox.Group items={items} className={group}>
      {label && <BaseCombobox.GroupLabel className={groupLabel}>{label}</BaseCombobox.GroupLabel>}
      <BaseCombobox.Collection>{children}</BaseCombobox.Collection>
    </BaseCombobox.Group>
  );
}

/** One item in the list, ticked while chosen. */
function ComboboxItem({
  value,
  icon,
  disabled,
  children,
}: {
  value: BaseCombobox.Item.Props["value"];
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <BaseCombobox.Item value={value} disabled={disabled} className={row}>
      {icon && (
        <span data-icon="" className={rowIcon}>
          {icon}
        </span>
      )}
      <span className={rowLabel}>{children}</span>
      <BaseCombobox.ItemIndicator
        keepMounted
        className={cn(rowCheck, "invisible group-data-selected/row:visible")}
      >
        <Check weight="bold" />
      </BaseCombobox.ItemIndicator>
    </BaseCombobox.Item>
  );
}

/** Clears the choice, from inside the Pill that shows it. It shows only while something is chosen. */
function ComboboxClear({
  "aria-label": label = "Clear",
  ...props
}: Omit<BaseCombobox.Clear.Props, "className" | "children">) {
  return (
    <BaseCombobox.Clear
      aria-label={label}
      {...props}
      className={cn(pillChevron, "cursor-pointer hover:text-ink", reach)}
    >
      <X />
    </BaseCombobox.Clear>
  );
}

/**
 * A select whose list can be searched, on Base UI's Combobox. Root is Base UI's own: give it `items` (or groups of
 * them), and `itemToStringLabel` when they're objects. The rest add the GovBB look.
 */
export const Combobox = {
  Root: BaseCombobox.Root,
  Trigger: ComboboxTrigger,
  Content: ComboboxContent,
  Group: ComboboxGroup,
  Item: ComboboxItem,
  Clear: ComboboxClear,
};
