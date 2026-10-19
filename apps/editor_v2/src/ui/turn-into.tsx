import type { Menu as BaseMenu } from "@base-ui/react/menu";
import { Swap } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../cn";
import { Kbd } from "./kbd";
import { Menu, SubmenuRowContent } from "./menu";
import { buttonRow } from "./surface";

/** A type of block that a block can turn into. */
export type TurnIntoOption = {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Its keyboard shortcut, as the platform writes it, such as shortcut() gives. */
  readonly shortcut?: string;
};

type TurnIntoProps = {
  /** The type the blocks are now, ticked; null when they differ. */
  value: string | null;
  options: readonly TurnIntoOption[];
  onValueChange: (value: string) => void;
};

function Options({ value, options, onValueChange }: TurnIntoProps) {
  return (
    <Menu.RadioGroup value={value} onValueChange={(next: string) => onValueChange(next)}>
      {options.map((option) => (
        <Menu.RadioItem
          key={option.value}
          value={option.value}
          icon={option.icon}
          detail={option.shortcut && <Kbd>{option.shortcut}</Kbd>}
          closeOnClick
        >
          {option.label}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}

const current = ({ value, options }: TurnIntoProps) =>
  options.find((option) => option.value === value)?.label;

/**
 * Turn into, in a block's menu: a row naming what the block is now, opening a submenu of the types it can
 * become, each with its shortcut.
 */
export function TurnIntoSubmenu(props: TurnIntoProps) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger openOnHover={false} icon={<Swap />} detail={current(props)}>
        Turn into
      </Menu.SubTrigger>
      <Menu.SubContent aria-label="Turn into">
        <Options {...props} />
      </Menu.SubContent>
    </Menu.Sub>
  );
}

/**
 * The same choices in a menu of their own, for a panel of rows or a toolbar that isn't a menu. A row like
 * TurnIntoSubmenu's opens them beside it, or below it where there's no room; `trigger`, such as a toolbar's button,
 * opens them below it instead.
 */
export function TurnIntoMenu({
  trigger,
  finalFocus,
  ...props
}: TurnIntoProps & {
  trigger?: ReactElement;
  finalFocus?: BaseMenu.Popup.Props["finalFocus"];
}) {
  return (
    <Menu.Root>
      {trigger ? (
        <>
          <Menu.Trigger render={trigger} />
          <Menu.Content aria-label="Turn into" finalFocus={finalFocus}>
            <Options {...props} />
          </Menu.Content>
        </>
      ) : (
        <>
          {/* Shaded while its menu is open, as a submenu's row is; its detail and caret turn white with its label */}
          <Menu.Trigger
            className={cn(
              buttonRow,
              "data-popup-open:not-hover:bg-hover [&:is(:hover,:focus-visible)_span]:text-white",
            )}
          >
            <SubmenuRowContent icon={<Swap />} detail={current(props)}>
              Turn into
            </SubmenuRowContent>
          </Menu.Trigger>
          <Menu.SubContent
            aria-label="Turn into"
            side="inline-end"
            collisionAvoidance={{ fallbackAxisSide: "end" }}
            finalFocus={finalFocus}
          >
            <Options {...props} />
          </Menu.SubContent>
        </>
      )}
    </Menu.Root>
  );
}
