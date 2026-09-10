import { Tooltip } from "../../components/ui/tooltip";
import { Tabs } from "../../components/ui/tabs";

interface SlidingTabsProps<K extends string> {
  options: ReadonlyArray<{
    key: K;
    label: string;
    disabled?: boolean;
    id?: string;
    controls?: string;
  }>;
  value: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
  className?: string;
}

export function SlidingTabs<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SlidingTabsProps<K>) {
  return (
    <Tabs
      tabs={options.map((option) => ({
        value: option.key,
        label: option.label,
        disabled: option.disabled,
        id: option.id,
        "aria-controls": option.controls,
      }))}
      value={value}
      onValueChange={(next) => onChange(next as K)}
      activateOnFocus
      aria-label={ariaLabel}
      className={className}
      size="sm"
    />
  );
}

/** Shared tooltip; wrap any trigger. `placement="bottom"` flips it under
 *  the trigger — use it for triggers flush with the top of the viewport,
 *  where the default above-position would clip. */
export function Tip({
  label,
  children,
  placement,
}: {
  label: string;
  children: React.ReactNode;
  placement?: "top" | "bottom";
}) {
  return (
    <Tooltip
      content={label}
      side={placement}
      render={<span className="inline-flex" />}
    >
      {children}
    </Tooltip>
  );
}
