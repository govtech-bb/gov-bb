import { MoreHorizontalIcon } from "hugeicons-react";
import { Button } from "../../components/ui/button";
import { DropdownMenu } from "../../components/ui/dropdown";

export interface HeaderMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export function HeaderMenu({
  items,
  ariaLabel = "More actions",
}: {
  items: HeaderMenuItem[];
  ariaLabel?: string;
}) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            aria-label={ariaLabel}
          />
        }
      >
        <MoreHorizontalIcon size={15} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {items.map((item) => (
          <DropdownMenu.Item
            key={item.label}
            variant={item.danger ? "danger" : "default"}
            icon={item.icon}
            onClick={item.onSelect}
          >
            {item.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
