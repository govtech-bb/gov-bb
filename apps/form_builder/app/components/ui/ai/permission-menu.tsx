import { ArrowDown01Icon, FlashIcon, PencilEdit02Icon } from "hugeicons-react";
import { Button } from "../button";
import { DropdownMenu } from "../dropdown";
import type { Permission } from "./history";

export function PermissionMenu({
  value,
  onValueChange,
  disabled,
}: {
  value: Permission;
  onValueChange: (permission: Permission) => void;
  disabled?: boolean;
}) {
  const label = value === "auto" ? "Auto" : "Ask";
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        disabled={disabled}
        aria-label={`Edit behavior: ${label}`}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-lg px-1.5 text-[12px] font-normal [--ui-button-pressed:transparent]"
        >
          {value === "auto" ? (
            <FlashIcon size={14} aria-hidden="true" />
          ) : (
            <PencilEdit02Icon size={14} aria-hidden="true" />
          )}
          {label}
          <ArrowDown01Icon size={13} aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content side="top" align="start" className="w-72">
        <DropdownMenu.RadioGroup
          value={value}
          onValueChange={(next) => {
            if (next === "ask" || next === "auto") onValueChange(next);
          }}
        >
          <DropdownMenu.RadioItem
            value="ask"
            closeOnClick
            className="items-start gap-2"
          >
            <PencilEdit02Icon
              size={18}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />
            <span className="grid gap-1">
              <span>Ask before editing</span>
              <small>Review and approve each change</small>
            </span>
          </DropdownMenu.RadioItem>
          <DropdownMenu.RadioItem
            value="auto"
            closeOnClick
            className="items-start gap-2"
          >
            <FlashIcon
              size={18}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />
            <span className="grid gap-1">
              <span>Automatically edit</span>
              <small>Always allow edits for this conversation</small>
            </span>
          </DropdownMenu.RadioItem>
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
