import { Select as BaseSelect } from "@base-ui/react/select";
import { CaretDown, Check } from "@phosphor-icons/react";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "../cn";
import { Field } from "./field";
import { pillChevron, pillIcon, pillLook, type PillTone } from "./pill";
import {
  fieldList,
  fieldPopup,
  group,
  groupLabel,
  rowCheck,
  rowIcon,
  rowLabel,
  row,
  touchTarget,
} from "./surface";

export type SelectItem<V extends string = string> = {
  value: V;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** A heading for the item. Items under the same heading are listed together, in the order headings first appear. */
  group?: string;
};

// A field's frame, as an Input's. The pill brings its own from ./pill
const frame = `min-w-0 cursor-pointer items-center rounded-sm text-start text-14 leading-none text-ink shadow-input outline-none transition-shadow hover:shadow-input-hover focus-visible:shadow-input-focus data-popup-open:shadow-input-focus data-disabled:cursor-not-allowed ${touchTarget}`;

const looks = {
  // A settings field: the width of its column. An error edges it in red, as it does an Input
  field: `${frame} flex w-full gap-2 bg-white px-2.5 font-normal aria-invalid:shadow-input-error aria-invalid:focus-visible:shadow-input-focus data-disabled:bg-tint data-disabled:text-muted data-disabled:shadow-none max-sm:text-16`,
  // A word in a sentence, such as a logic rule: as wide as its value
  pill: "cursor-pointer data-disabled:cursor-not-allowed data-disabled:opacity-50",
  // A list's filter, in the toolbar over it, as wide as its value but at least 192px beside the others, so choosing one,
  // such as a category, doesn't push the filters after it along. While it narrows the list it's a Tag's chosen blue, so
  // the filters at work stand out from those showing everything; hover and focus still edge it. Its "everything" is an
  // item valued "" or, with `multiple`, its placeholder
  filter: `${frame} inline-flex max-w-64 gap-2 bg-white px-2.5 font-normal not-data-placeholder:bg-highlight not-data-placeholder:text-blue-80 not-data-placeholder:shadow-none max-sm:text-16 sm:min-w-48`,
};

// Input's heights: md beside a dialog's or a panel's fields, sm in a toolbar, a popover or a sentence
const sizes = { md: "h-9", sm: "h-8" };

type SelectLook = keyof typeof looks;

export type SelectSize = keyof typeof sizes;

/** Classes for a select's trigger, which a combobox's share. A field is md by default, a pill or a filter sm. */
export const selectTrigger = (look: SelectLook, size?: SelectSize, tone?: PillTone) =>
  cn(
    look === "pill" && pillLook(tone),
    looks[look],
    sizes[size ?? (look === "field" ? "md" : "sm")],
  );

// The root's items by value, so its trigger can show the chosen one's label and icon
const Items = createContext<ReadonlyMap<string, SelectItem> | undefined>(undefined);

type RootProps<V extends string, M extends boolean | undefined> = Omit<
  BaseSelect.Root.Props<V, M>,
  "items"
> & {
  /** What it offers. The trigger shows the chosen one's label and icon. */
  items?: readonly SelectItem<V>[];
};

/** Base UI's root, given the items its trigger shows. */
function SelectRoot<V extends string, M extends boolean | undefined = false>({
  items,
  ...props
}: RootProps<V, M>) {
  return (
    <Items value={items && new Map(items.map((item) => [item.value, item]))}>
      <BaseSelect.Root<V, M> {...props} items={items} />
    </Items>
  );
}

type TriggerProps = Omit<BaseSelect.Trigger.Props, "className" | "children"> & {
  look?: SelectLook;
  size?: SelectSize;
  /** A pill's tone. */
  tone?: PillTone;
  /** Before the value, in place of the chosen item's own icon. */
  icon?: ReactNode;
  placeholder?: ReactNode;
  /** The chosen item's icon alone, its label left to screen readers. A Tip around it can name the choice. */
  iconOnly?: boolean;
  className?: string;
  /** In place of the chosen item, such as several choices written out. */
  children?: ReactNode;
};

/**
 * The button that shows what's chosen and opens the list: the chosen item from the root's items, or the first of
 * several and how many more. A field fills its column; a pill or a filter is as wide as its value.
 */
function SelectTrigger({
  look = "field",
  size,
  tone,
  icon,
  placeholder,
  iconOnly,
  className,
  children,
  ...props
}: TriggerProps) {
  const items = useContext(Items);
  const iconClass = look === "pill" ? pillIcon : rowIcon;

  // A filter's placeholder is a choice in itself, everything, so it reads like one
  const empty = (
    <span className={cn("truncate", look !== "filter" && "text-placeholder")}>{placeholder}</span>
  );

  const chosen = (value: string | string[] | null) => {
    const [first, ...more] = Array.isArray(value) ? value : value === null ? [] : [value];
    const item = first === undefined ? undefined : items?.get(first);

    if (!item) return empty;

    return (
      <>
        {!icon && item.icon && (
          <span className={cn(iconClass, iconOnly && "[&>svg]:size-4")}>{item.icon}</span>
        )}
        <span className={iconOnly ? "sr-only" : "truncate"}>{item.label}</span>
        {more.length > 0 && <span className="shrink-0 font-normal text-muted">+{more.length}</span>}
      </>
    );
  };

  return (
    <BaseSelect.Trigger {...props} className={cn(selectTrigger(look, size, tone), className)}>
      {icon && <span className={iconClass}>{icon}</span>}
      <BaseSelect.Value
        className={cn(
          "flex min-w-0 items-center leading-normal",
          look === "pill" ? "gap-1.5" : "flex-1 gap-2",
        )}
      >
        {children === undefined ? chosen : <span className="truncate">{children}</span>}
      </BaseSelect.Value>
      <BaseSelect.Icon className={pillChevron}>
        <CaretDown />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

/** The list in its portal, at least as wide as its trigger. `footer` sits under the list, outside its scroll. */
function SelectContent({ footer, children }: { footer?: ReactNode; children: ReactNode }) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        alignItemWithTrigger={false}
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className="z-popup outline-none"
      >
        <BaseSelect.Popup className={fieldPopup}>
          <BaseSelect.List className={fieldList}>{children}</BaseSelect.List>
          {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

/** One item in the list, ticked while chosen. */
function SelectOption({
  value,
  icon,
  disabled,
  children,
}: {
  value: string;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <BaseSelect.Item value={value} disabled={disabled} className={row}>
      {icon && (
        <span data-icon="" className={rowIcon}>
          {icon}
        </span>
      )}
      <BaseSelect.ItemText className={rowLabel}>{children}</BaseSelect.ItemText>
      <BaseSelect.ItemIndicator
        keepMounted
        className={cn(rowCheck, "invisible group-data-selected/row:visible")}
      >
        <Check weight="bold" />
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

/** Items that belong together, under an optional heading, ruled off from the next group. */
function SelectGroup({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <BaseSelect.Group className={group}>
      {label && <BaseSelect.GroupLabel className={groupLabel}>{label}</BaseSelect.GroupLabel>}
      {children}
    </BaseSelect.Group>
  );
}

// A visible label wraps the select in a Field, with its hint and error. Without one, name it
type Naming =
  | {
      label: ReactNode;
      /** What to choose, or what the choice changes. */
      hint?: ReactNode;
      /** Why the choice can't be used. It marks the select invalid. */
      error?: ReactNode;
      "aria-label"?: never;
      "aria-labelledby"?: never;
    }
  | {
      "aria-label": string;
      "aria-labelledby"?: never;
      label?: never;
      hint?: never;
      error?: never;
    }
  | {
      "aria-labelledby": string;
      "aria-label"?: never;
      label?: never;
      hint?: never;
      error?: never;
    };

// The items alone decide the values a select takes, so a value that isn't one of them is an error
export type SelectProps<V extends string> = Naming & {
  items: readonly SelectItem<V>[];
  variant?: SelectLook;
  /** Shown before the value, in place of the chosen item's own icon. */
  icon?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  /** For the trigger. */
  className?: string;
} & (
    | {
        multiple?: false;
        value?: NoInfer<V> | null;
        defaultValue?: NoInfer<V> | null;
        onValueChange?: (value: NoInfer<V>) => void;
      }
    | {
        multiple: true;
        value?: NoInfer<V>[];
        defaultValue?: NoInfer<V>[];
        onValueChange?: (value: NoInfer<V>[]) => void;
      }
  );

/**
 * Picks one item, or several with `multiple`, from a list: the parts below, put together. With a `label`, it's a
 * Field: the label, then the select, its hint and its error. Build from the parts for anything else, such as a footer
 * under the list or a trigger that shows only the chosen item's icon.
 */
export function Select<V extends string>(props: SelectProps<V>) {
  const { items, variant = "field", icon, placeholder, disabled, className } = props;

  // Inside a Field, the field's label names the trigger: an aria-labelledby of our own, even undefined, would replace it
  const naming =
    props.label === undefined
      ? { "aria-label": props["aria-label"], "aria-labelledby": props["aria-labelledby"] }
      : undefined;

  const parts = (
    <>
      <SelectTrigger
        {...naming}
        look={variant}
        icon={icon}
        placeholder={placeholder}
        className={className}
      />
      <SelectContent>
        {Array.from(
          Map.groupBy(items, (item) => item.group),
          ([heading, members]) => (
            <SelectGroup key={heading ?? ""} label={heading}>
              {members.map((item) => (
                <SelectOption
                  key={item.value}
                  value={item.value}
                  icon={item.icon}
                  disabled={item.disabled}
                >
                  {item.label}
                </SelectOption>
              ))}
            </SelectGroup>
          ),
        )}
      </SelectContent>
    </>
  );

  const labelled = (control: ReactNode) =>
    props.label === undefined ? (
      control
    ) : (
      <Field
        label={props.label}
        hint={props.hint}
        error={props.error}
        disabled={disabled}
        nativeLabel={false}
      >
        {control}
      </Field>
    );

  if (props.multiple) {
    const { value, defaultValue, onValueChange } = props;

    return labelled(
      <SelectRoot<V, true>
        multiple
        items={items}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => onValueChange?.(next)}
        disabled={disabled}
      >
        {parts}
      </SelectRoot>,
    );
  }

  const { value, defaultValue, onValueChange } = props;

  return labelled(
    <SelectRoot<V>
      items={items}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => next !== null && onValueChange?.(next)}
      disabled={disabled}
    >
      {parts}
    </SelectRoot>,
  );
}

Select.Root = SelectRoot;

Select.Trigger = SelectTrigger;

Select.Content = SelectContent;

Select.Item = SelectOption;

Select.Group = SelectGroup;
