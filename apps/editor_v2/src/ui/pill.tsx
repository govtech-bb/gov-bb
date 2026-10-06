import { Select } from "@base-ui/react/select";
import { CaretDown, Check } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { cn } from "../cn";
import { check, list, option, popup } from "./select";

/** Shared compact control for calculated values and conditional logic. */
export const pill =
  "inline-flex h-8 max-w-80 min-w-0 items-center gap-1.5 rounded-sm bg-white px-2.5 text-14 leading-none font-semibold text-ink shadow-input outline-none transition-shadow duration-150 hover:shadow-input-hover focus-visible:shadow-input-focus has-focus-visible:shadow-input-focus aria-expanded:shadow-input-focus has-aria-expanded:shadow-input-focus data-placeholder:text-muted has-placeholder-shown:text-muted";

export const pillIcon = "inline-flex shrink-0 items-center text-muted [&>svg]:size-3.5";

export const pillChevron = "inline-flex shrink-0 items-center text-muted [&>svg]:size-3";

/** An invisible text copy sizes the input; value/onChange optionally control it. */
export function PillInput({
  defaultValue = "",
  value: controlled,
  onChange,
  placeholder,
  label,
}: {
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  label?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;

  const setValue = (next: string) => {
    setOwn(next);
    onChange?.(next);
  };

  return (
    <span className="relative inline-flex min-w-0">
      <span aria-hidden className="invisible min-w-[1ch] leading-normal whitespace-pre">
        {value || placeholder}
      </span>
      <input
        type="text"
        size={1}
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        data-1p-ignore
        onChange={(e) => setValue(e.target.value)}
        className="absolute inset-0 w-full min-w-0 leading-normal text-ellipsis outline-none placeholder:text-inherit"
      />
    </span>
  );
}

type Option = { value: string; label: string; icon?: ReactNode };

export function PillSelect({
  items,
  defaultValue,
  value,
  onValueChange,
  placeholder,
  icon,
  label,
}: {
  items: Option[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  label?: string;
}) {
  return (
    <Select.Root
      items={items}
      defaultValue={defaultValue}
      {...(value !== undefined && {
        value,
        onValueChange: (v: string | null) => v && onValueChange?.(v),
      })}
    >
      <Select.Trigger aria-label={label} className={cn(pill, "cursor-pointer")}>
        {icon && <span className={pillIcon}>{icon}</span>}
        <Select.Value
          placeholder={placeholder}
          className="pointer-events-none min-w-0 truncate leading-normal select-none"
        />
        <Select.Icon className={pillChevron}>
          <CaretDown />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          alignItemWithTrigger={false}
          align="start"
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Select.Popup className={popup}>
            <Select.List className={list}>
              {items.map((o) => (
                <Select.Item key={o.value} value={o.value} className={option}>
                  {o.icon}
                  <Select.ItemText className="min-w-0 flex-1 truncate">{o.label}</Select.ItemText>
                  <Select.ItemIndicator className={check}>
                    <Check />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
