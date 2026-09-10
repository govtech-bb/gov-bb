import { Tooltip } from "../tooltip";
import { cn } from "../utils/cn";
import { IconContext } from "@phosphor-icons/react";
import React, { useRef } from "react";
import { useMenuNavigation } from "./use-menu-navigation";

export function menuBarVariants() {
  return cn(
    // Base styles
    "flex rounded-lg border border-ui-tint bg-ui-tint pl-px shadow-xs transition-colors",
  );
}
/** Props for an individual menu option within a MenuBar. */
type MenuOptionProps = {
  /** Icon element (typically from `@phosphor-icons/react`) rendered at 18px */
  icon: React.ReactNode;
  /** Unique identifier for the option (used when `optionIds` is true) */
  id?: number | string;
  /** Currently active value from the parent MenuBar */
  isActive?: number | boolean | string | undefined;
  /** Callback when this option is clicked */
  onClick: () => void;
  /** Tooltip text shown on hover */
  tooltip: string;
};
const MenuOption = ({
  icon,
  id,
  isActive,
  onClick,
  tooltip,
}: MenuOptionProps) => {
  const button = (
    <button
      data-ui-component="MenuBar"
      data-ui-part="option"
      aria-label={tooltip}
      className={cn(
        "relative -ml-px flex h-full w-11 cursor-pointer items-center justify-center rounded-md border-none bg-ui-tint transition-colors first:rounded-l-lg last:rounded-r-lg focus:z-3 focus:ring-ui-focus/50 focus:outline-none focus-visible:z-3 focus-visible:ring-2 focus-visible:ring-ui-brand",
        {
          "z-2 bg-ui-base shadow-xs transition-colors": isActive === id,
        },
      )}
      onClick={onClick}
    >
      <IconContext.Provider value={{ size: 18 }}>{icon}</IconContext.Provider>
    </button>
  );
  return <Tooltip content={tooltip} render={button} />;
};
type MenuBarProps = {
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  /** The currently active option value — matched against option index or `id`. */
  isActive: number | boolean | string | undefined;
  /** Array of menu option configurations. */
  options: MenuOptionProps[];
  /** When true, each option's `id` field is used for matching instead of its array index. */
  optionIds?: boolean;
};
export const MenuBar = ({
  className,
  isActive,
  options,
  optionIds = false, // if option needs an extra unique ID
}: MenuBarProps) => {
  const menuRef = useRef<HTMLElement | null>(null);
  useMenuNavigation({ menuRef, direction: "horizontal" });
  return (
    <nav
      className={cn(
        "isolate flex rounded-lg bg-ui-tint pl-px shadow-xs ring ring-ui-hairline transition-colors",
        className,
      )}
      ref={menuRef}
    >
      {options.map((option, index) => (
        <MenuOption
          key={index}
          {...option}
          isActive={isActive}
          id={optionIds ? option.id : index}
        />
      ))}
    </nav>
  );
};
