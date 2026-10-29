import { Menu as BaseMenu } from "@base-ui/react/menu";
import { CaretDown, X } from "@phosphor-icons/react";
import { useState } from "react";
import { addToRange } from "react-day-picker";
import { cn } from "../../../cn";
import { Calendar, type DateRange } from "../../../ui/calendar";
import { Input, input } from "../../../ui/input";
import { formatDay, parseDay, shortDate } from "../../core/dates";
import { Menu } from "../../../ui/menu";
import { RELATIVE_DATES } from "../../core/field-settings";
import type { Setting } from "../../core/settings";
import { SettingsGroup, Switch, Pick, SubmenuRow, useStore } from "../../react/settings-controls";
import {
  InputStatus,
  InputHints,
  RepeatAnswer,
  InputEnd,
  type FieldControlsProps,
} from "../shared/controls";

const today = "utility::today()";

const noDateLimits = {
  beforeDate: undefined,
  afterDate: undefined,
  dateRange: undefined,
  specificDates: undefined,
  dateFrom: undefined,
  dateTo: undefined,
};

export function DateControls({ m, a }: FieldControlsProps) {
  return (
    <SettingsGroup>
      <InputStatus m={m} />
      <InputHints m={m} a={a} />
      {m.header && (
        <Switch
          label="Default answer"
          on="hasDefaultAnswer"
          clear="defaultAnswer"
          field={<DateDefault />}
        />
      )}
      <Pick label="Past or future" value="relativeDate" options={RELATIVE_DATES} fallback="" />
      <DateLimits />
      <Switch label="Min age" on="hasMinAge" value="minAge" type="number" />
      <Switch label="Max age" on="hasMaxAge" value="maxAge" type="number" />
      <RepeatAnswer m={m} a={a} />
      <InputEnd m={m} a={a} />
    </SettingsGroup>
  );
}

function DateLimits() {
  const { settings: s, set } = useStore();

  const range =
    s.dateRange && typeof s.dateRange === "object" && !Array.isArray(s.dateRange)
      ? s.dateRange
      : {};

  const from = typeof range.from === "string" ? parseDay(range.from) : undefined;
  const to = typeof range.to === "string" ? parseDay(range.to) : undefined;

  const limit = (key: "beforeDate" | "afterDate") => (day?: string) =>
    set({ ...noDateLimits, [key]: day });

  return (
    <>
      <DateItem
        label="Before date"
        closeOnSelect
        dates={[s.beforeDate]}
        month={parseDay(s.beforeDate)}
        selected={{ from: new Date(1900, 0, 1), to: parseDay(s.beforeDate) }}
        onDay={limit("beforeDate")}
        onClear={s.beforeDate ? limit("beforeDate") : undefined}
      />
      <DateItem
        label="After date"
        closeOnSelect
        dates={[s.afterDate]}
        month={parseDay(s.afterDate)}
        selected={{ from: parseDay(s.afterDate), to: new Date(2099, 11, 31) }}
        onDay={limit("afterDate")}
        onClear={s.afterDate ? limit("afterDate") : undefined}
      />
      <DateItem
        label="Date range"
        dates={[range.from, range.to]}
        selected={{ from, to }}
        onDay={(day) => {
          const next = from ? addToRange(parseDay(day)!, { from, to }) : { from: parseDay(day) };
          set({
            ...noDateLimits,
            dateRange: next?.from
              ? { from: formatDay(next.from), ...(next.to && { to: formatDay(next.to) }) }
              : undefined,
          });
        }}
        onClear={range.from || range.to ? () => set(noDateLimits) : undefined}
      />
    </>
  );
}

function DateItem({
  label,
  dates,
  selected,
  month,
  closeOnSelect,
  onDay,
  onClear,
}: {
  label: string;
  dates: (Setting | undefined)[];
  selected: DateRange;
  month?: Date;
  closeOnSelect?: boolean;
  onDay: (day: string) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const text = dates
    .flatMap((d) => parseDay(d) ?? [])
    .map(shortDate)
    .join(", ");

  return (
    <SubmenuRow
      label={label}
      text={text || "Off"}
      open={open}
      onOpenChange={setOpen}
      className="min-w-0"
    >
      {/* The calendar's keys are its own: the menu would take arrows for moving */}
      <div onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()} className="py-1.5">
        <Calendar
          mode="range"
          value={selected}
          defaultMonth={month}
          weekStartsOn={1}
          onValueChange={(_, day) => {
            if (closeOnSelect) setOpen(false);
            onDay(formatDay(day));
          }}
        />
      </div>
      {onClear && (
        <>
          <Menu.Separator />
          <Menu.Item closeOnClick={false} onClick={() => (onClear(), setOpen(false))}>
            Clear
          </Menu.Item>
        </>
      )}
    </SubmenuRow>
  );
}

function DateDefault() {
  const { settings, set } = useStore();
  const given = settings.defaultAnswer;

  const isToday =
    !!given && typeof given === "object" && !Array.isArray(given) && given.field === today;

  return (
    <div className="relative mx-3.5 mt-0.5 mb-1.5">
      {isToday ? (
        <div className={cn(input("sm"), "flex items-center pe-7")}>Today</div>
      ) : (
        <Input
          size="sm"
          type="text"
          aria-label="Default date"
          defaultValue={typeof settings.defaultAnswer === "string" ? settings.defaultAnswer : ""}
          onChange={(e) => set({ defaultAnswer: e.target.value || undefined })}
          onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
          className="pe-7"
        />
      )}
      {isToday ? (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => set({ defaultAnswer: undefined })}
          className="absolute inset-y-0 right-0 flex w-7 cursor-pointer items-center justify-center text-muted hover:text-ink"
        >
          <X className="size-4" />
        </button>
      ) : (
        <Menu.Sub>
          <BaseMenu.SubmenuTrigger
            openOnHover={false}
            aria-label="Pick a field"
            className="absolute inset-y-0 right-0 flex w-7 cursor-pointer items-center justify-center rounded-xs text-muted hover:text-ink"
          >
            <CaretDown className="size-3.5" />
          </BaseMenu.SubmenuTrigger>
          <Menu.SubContent aria-label="Pick a field" className="min-w-40">
            <Menu.Group label="Date utilities">
              <Menu.Item onClick={() => set({ defaultAnswer: { field: today } })}>Today</Menu.Item>
            </Menu.Group>
          </Menu.SubContent>
        </Menu.Sub>
      )}
    </div>
  );
}
