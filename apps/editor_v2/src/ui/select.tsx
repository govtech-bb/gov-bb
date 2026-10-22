import { Select as BaseSelect } from "@base-ui/react/select";
import { CaretDown, Check } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { Field } from "./field";
import {
  fieldList,
  fieldPopup,
  group,
  groupLabel,
  rowCheck,
  rowIcon,
  rowLabel,
  row,
  surface,
  touchTarget,
} from "./surface";

/** The bare sheet, for a popup not yet built from ui/menu, ui/popover or ui/dialog. */
export const panel = surface;

export type SelectItem<V extends string = string> = {
  value: V;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** A heading for the item. Items under the same heading are listed together, in the order headings first appear. */
  group?: string;
};

const triggers = {
  // A settings field: the width of its column. An error edges it in red, as it does an Input
  field:
    "flex h-9 w-full gap-2 bg-white px-2.5 font-normal aria-invalid:shadow-input-error aria-invalid:focus-visible:shadow-input-focus data-disabled:bg-tint data-disabled:text-muted data-disabled:shadow-none max-sm:text-16",
  // A word in a sentence, such as a logic rule: as wide as its value
  pill: "inline-flex h-8 max-w-80 gap-1.5 bg-white px-2.5 font-semibold data-disabled:opacity-50",
  // A list's filter, in the toolbar over it: Input sm's height, as wide as its value. While it narrows the list it's a
  // Tag's chosen blue, so the filters at work stand out from those showing everything; hover and focus still edge it.
  // Its "everything" is an item valued "" or, with `multiple`, its placeholder
  filter:
    "inline-flex h-8 max-w-64 gap-2 bg-white px-2.5 font-normal not-data-placeholder:bg-highlight not-data-placeholder:text-blue-80 not-data-placeholder:shadow-none max-sm:text-16",
};

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
  variant?: keyof typeof triggers;
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
 * Picks one item, or several with `multiple`, from a list. The trigger shows the chosen item, or the first of several
 * and how many more. With a `label`, it's a Field: the label, then the select, its hint and its error.
 */
export function Select<V extends string>(props: SelectProps<V>) {
  const { items, variant = "field", icon, placeholder, disabled, className } = props;

  // Inside a Field, the field's label names the trigger: an aria-labelledby of our own, even undefined, would replace it
  const naming =
    props.label === undefined
      ? { "aria-label": props["aria-label"], "aria-labelledby": props["aria-labelledby"] }
      : undefined;

  const byValue = new Map(items.map((item) => [item.value, item]));

  // A filter's placeholder is a choice in itself, everything, so it reads like one
  const empty = (
    <span className={cn("truncate", variant !== "filter" && "text-placeholder")}>
      {placeholder}
    </span>
  );

  const chosen = (item: SelectItem<V>, more = 0) => (
    <>
      {!icon && item.icon && <span className={rowIcon}>{item.icon}</span>}
      <span className="truncate">{item.label}</span>
      {more > 0 && <span className="shrink-0 font-normal text-muted">+{more}</span>}
    </>
  );

  const trigger = (value: BaseSelect.Value.Props["children"]) => (
    <BaseSelect.Trigger
      {...naming}
      className={cn(
        "min-w-0 cursor-pointer items-center rounded-sm text-start text-14 leading-none text-ink shadow-input outline-none transition-shadow duration-150 hover:shadow-input-hover focus-visible:shadow-input-focus data-popup-open:shadow-input-focus data-disabled:cursor-not-allowed",
        touchTarget,
        triggers[variant],
        className,
      )}
    >
      {icon && <span className={rowIcon}>{icon}</span>}
      <BaseSelect.Value
        className={cn(
          "flex min-w-0 items-center gap-2 leading-normal",
          variant !== "pill" && "flex-1",
        )}
      >
        {value}
      </BaseSelect.Value>
      <BaseSelect.Icon className="flex shrink-0 text-muted [&>svg]:size-3.5">
        <CaretDown />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );

  const options = (
    <SelectPopup>
      {Array.from(
        Map.groupBy(items, (item) => item.group),
        ([heading, members]) => (
          <BaseSelect.Group key={heading ?? ""} className={group}>
            {heading && (
              <BaseSelect.GroupLabel className={groupLabel}>{heading}</BaseSelect.GroupLabel>
            )}
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
          </BaseSelect.Group>
        ),
      )}
    </SelectPopup>
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
      <BaseSelect.Root<V, true>
        multiple
        items={items}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => onValueChange?.(next)}
        disabled={disabled}
      >
        {trigger((values: V[]) => {
          const [first, ...rest] = values;
          const item = first === undefined ? undefined : byValue.get(first);

          return item ? chosen(item, rest.length) : empty;
        })}
        {options}
      </BaseSelect.Root>,
    );
  }

  const { value, defaultValue, onValueChange } = props;

  return labelled(
    <BaseSelect.Root<V>
      items={items}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => next !== null && onValueChange?.(next)}
      disabled={disabled}
    >
      {trigger((current: V | null) => {
        const item = current === null ? undefined : byValue.get(current);

        return item ? chosen(item) : empty;
      })}
      {options}
    </BaseSelect.Root>,
  );
}

/**
 * A select's list in its portal, for a select that brings its own Root and Trigger. Holds SelectOptions; `footer` sits
 * under the list, outside its scroll.
 */
export function SelectPopup({ footer, children }: { footer?: ReactNode; children: ReactNode }) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        alignItemWithTrigger={false}
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className="z-50 outline-none"
      >
        <BaseSelect.Popup className={fieldPopup}>
          <BaseSelect.List className={fieldList}>{children}</BaseSelect.List>
          {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

/** One item in a select's list, ticked while chosen. */
export function SelectOption({
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
