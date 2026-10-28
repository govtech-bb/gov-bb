import { Menu as BaseMenu } from "@base-ui/react/menu";
import { CaretRight, Check } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { Field } from "./field";
import { Input } from "./input";
import {
  group,
  groupLabel,
  listPopup,
  row,
  rowCheck,
  rowDetail,
  rowIcon,
  rowLabel,
  separator,
  type PopupName,
} from "./surface";
import { switchThumb, switchTrack } from "./switch";

type ContentProps = Pick<
  BaseMenu.Positioner.Props,
  | "side"
  | "align"
  | "sideOffset"
  | "alignOffset"
  | "anchor"
  | "collisionPadding"
  | "collisionAvoidance"
  | "positionMethod"
> &
  Pick<BaseMenu.Popup.Props, "finalFocus"> &
  PopupName & {
    /** For the popup, such as its width. */
    className?: string;
    children: ReactNode;
  };

/**
 * The menu in its portal, below its trigger and start-aligned unless placed otherwise. Its name is its own, not its
 * trigger's: a grip or a "More" button would name it badly.
 */
function MenuContent({
  finalFocus,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  className,
  children,
  ...placement
}: ContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        align="start"
        sideOffset={6}
        collisionPadding={8}
        {...placement}
        className="z-popup outline-none"
      >
        <BaseMenu.Popup
          finalFocus={finalFocus}
          aria-label={label}
          aria-labelledby={labelledBy}
          className={cn(listPopup, "min-w-48", className)}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

const besideRow = (side: string) => side !== "top" && side !== "bottom";

/**
 * A submenu's popup. Beside its row it overlaps the menu a little and rises by the popup's padding, so its first row
 * lines up with the row that opened it. Flipped above or below, it sits like any menu.
 */
function MenuSubContent(props: ContentProps) {
  return (
    <MenuContent
      sideOffset={({ side }) => (besideRow(side) ? 2 : 6)}
      alignOffset={({ side }) => (besideRow(side) ? -4 : 0)}
      {...props}
    />
  );
}

type RowParts = {
  /** Before the label. */
  icon?: ReactNode;
  /** After the label: a shortcut, a count or the current choice. */
  detail?: ReactNode;
  children: ReactNode;
};

/**
 * What a row holds: its icon, label and detail. The menu parts use it; so can a list that isn't a Base UI menu, such
 * as the slash menu, on an element with `row` from ./surface.
 */
export function RowContent({ icon, detail, children, danger }: RowParts & { danger?: boolean }) {
  return (
    <>
      {icon && (
        <span data-icon="" className={cn(rowIcon, danger && "text-error")}>
          {icon}
        </span>
      )}
      <span className={rowLabel}>{children}</span>
      {detail != null && <span className={rowDetail}>{detail}</span>}
    </>
  );
}

const itemVariants = {
  default: "",
  // Delete and the other actions that lose work
  danger: "text-error data-highlighted:bg-error",
};

type ItemProps = Omit<BaseMenu.Item.Props, "className" | "children"> &
  RowParts & { variant?: keyof typeof itemVariants; className?: string };

function MenuItem({ icon, detail, variant = "default", className, children, ...props }: ItemProps) {
  return (
    <BaseMenu.Item {...props} className={cn(row, itemVariants[variant], className)}>
      <RowContent icon={icon} detail={detail} danger={variant === "danger"}>
        {children}
      </RowContent>
    </BaseMenu.Item>
  );
}

type CheckboxItemProps = Omit<BaseMenu.CheckboxItem.Props, "className" | "children"> &
  RowParts & { className?: string };

function MenuCheckboxItem({ icon, detail, className, children, ...props }: CheckboxItemProps) {
  return (
    <BaseMenu.CheckboxItem {...props} className={cn(row, className)}>
      <RowContent icon={icon} detail={detail}>
        {children}
      </RowContent>
      <BaseMenu.CheckboxItemIndicator
        keepMounted
        className={cn(rowCheck, "data-unchecked:invisible")}
      >
        <Check weight="bold" />
      </BaseMenu.CheckboxItemIndicator>
    </BaseMenu.CheckboxItem>
  );
}

type RadioItemProps = Omit<BaseMenu.RadioItem.Props, "className" | "children"> &
  RowParts & { className?: string };

function MenuRadioItem({ icon, detail, className, children, ...props }: RadioItemProps) {
  return (
    <BaseMenu.RadioItem {...props} className={cn(row, className)}>
      <RowContent icon={icon} detail={detail}>
        {children}
      </RowContent>
      <BaseMenu.RadioItemIndicator keepMounted className={cn(rowCheck, "data-unchecked:invisible")}>
        <Check weight="bold" />
      </BaseMenu.RadioItemIndicator>
    </BaseMenu.RadioItem>
  );
}

type SwitchItemProps = Omit<BaseMenu.CheckboxItem.Props, "className" | "children"> &
  Omit<RowParts, "detail"> & { className?: string };

/**
 * A setting that takes effect as its row is pressed, as a Switch does, and the menu stays open for the next one. Its
 * switch slides as the kit's does, and turns white on the highlighted row's navy.
 */
function MenuSwitchItem({ icon, className, children, ...props }: SwitchItemProps) {
  return (
    <BaseMenu.CheckboxItem {...props} className={cn(row, className)}>
      <RowContent icon={icon}>{children}</RowContent>
      <BaseMenu.CheckboxItemIndicator
        keepMounted
        className={cn(
          switchTrack,
          "group-data-highlighted/row:bg-white/40 group-data-highlighted/row:data-checked:bg-white",
        )}
      >
        <span
          className={cn(
            switchThumb,
            "group-data-highlighted/row:group-data-checked/switch:bg-blue-80",
          )}
        />
      </BaseMenu.CheckboxItemIndicator>
    </BaseMenu.CheckboxItem>
  );
}

type FieldProps = Omit<ComponentProps<typeof Input>, "size"> & {
  label: ReactNode;
  /** What to enter, or what the setting changes. */
  hint?: ReactNode;
  /** Why the value can't be used. It marks the field invalid. */
  error?: ReactNode;
};

/**
 * A labelled field in a menu, such as a setting's value, level with the rows' text. Its keys are its own, where the
 * menu would take letters for typeahead and arrows for moving; Esc still closes the menu. Its props go to its input.
 */
function MenuField({ label, hint, error, onKeyDown, ...props }: FieldProps) {
  return (
    <Field size="sm" label={label} hint={hint} error={error} className="px-3.5 py-1.5">
      <Input
        {...props}
        size="sm"
        onKeyDown={(event) => {
          if (event.key !== "Escape") event.stopPropagation();
          onKeyDown?.(event);
        }}
      />
    </Field>
  );
}

type SubTriggerProps = Omit<BaseMenu.SubmenuTrigger.Props, "className" | "children"> &
  RowParts & { className?: string };

/** What a row that opens a submenu holds: a row's parts, then the caret that says it opens one. */
export function SubmenuRowContent({ icon, detail, children }: RowParts) {
  return (
    <>
      <RowContent icon={icon} detail={detail}>
        {children}
      </RowContent>
      <span className={cn(rowIcon, "[&>svg]:size-3.5")}>
        <CaretRight />
      </span>
    </>
  );
}

/** Opens a submenu. It stays shaded while its submenu is open, so the path back is plain. */
function MenuSubTrigger({ icon, detail, className, children, ...props }: SubTriggerProps) {
  return (
    <BaseMenu.SubmenuTrigger
      {...props}
      className={cn(row, "data-popup-open:not-data-highlighted:bg-hover", className)}
    >
      <SubmenuRowContent icon={icon} detail={detail}>
        {children}
      </SubmenuRowContent>
    </BaseMenu.SubmenuTrigger>
  );
}

/** Rows that belong together, under an optional heading. Groups are ruled off from each other. */
function MenuGroup({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <BaseMenu.Group className={group}>
      {label && <BaseMenu.GroupLabel className={groupLabel}>{label}</BaseMenu.GroupLabel>}
      {children}
    </BaseMenu.Group>
  );
}

/** A rule between rows that aren't in groups, such as before a lone Delete. */
function MenuSeparator() {
  return <BaseMenu.Separator className={separator} />;
}

/**
 * The tool's menus, on Base UI's Menu: Root, Trigger, RadioGroup and Sub are Base UI's own parts; the rest add the
 * GovBB look. Content puts the popup in its portal and places it.
 */
export const Menu = {
  Root: BaseMenu.Root,
  Trigger: BaseMenu.Trigger,
  Content: MenuContent,
  Group: MenuGroup,
  Item: MenuItem,
  CheckboxItem: MenuCheckboxItem,
  SwitchItem: MenuSwitchItem,
  Field: MenuField,
  RadioGroup: BaseMenu.RadioGroup,
  RadioItem: MenuRadioItem,
  Separator: MenuSeparator,
  Sub: BaseMenu.SubmenuRoot,
  SubTrigger: MenuSubTrigger,
  SubContent: MenuSubContent,
};
