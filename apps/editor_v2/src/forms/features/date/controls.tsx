import { Menu } from "@base-ui/react/menu";
import { CaretDown, X } from "@phosphor-icons/react";
import { useState } from "react";
import { addToRange } from "react-day-picker";
import { cn } from "../../../cn";
import { Calendar, type CalendarProps } from "../../../ui/calendar";
import { formatDay, parseDay, shortDate } from "../../core/dates";
import { item, ItemLabel, sectionLabel } from "../../../ui/item";
import { list, option, popup } from "../../../ui/select";
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
  selected: CalendarProps["selected"];
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
          selected={selected}
          month={month}
          weekStartsOn={1}
          onDayClick={(day) => {
            if (closeOnSelect) setOpen(false);
            onDay(formatDay(day));
          }}
        />
      </div>
      {onClear && (
        <div className="border-t border-line py-1.25">
          <Menu.Item
            closeOnClick={false}
            onClick={() => (onClear(), setOpen(false))}
            className={item}
          >
            <ItemLabel>Clear</ItemLabel>
          </Menu.Item>
        </div>
      )}
    </SubmenuRow>
  );
}

function DateDefault() {
  const { settings, set } = useStore();
  const given = settings.defaultAnswer;

  const isToday =
    !!given && typeof given === "object" && !Array.isArray(given) && given.field === today;

  const box =
    "flex h-8 w-full items-center rounded-sm bg-white pr-7 pl-2 text-14 text-ink shadow-input outline-none placeholder:text-placeholder hover:shadow-input-hover focus:shadow-input-focus max-sm:text-16";

  return (
    <div className="relative mx-3.5 mt-0.5 mb-1.5">
      {isToday ? (
        <div className={box}>Today</div>
      ) : (
        <input
          type="text"
          aria-label="Default date"
          defaultValue={typeof settings.defaultAnswer === "string" ? settings.defaultAnswer : ""}
          onChange={(e) => set({ defaultAnswer: e.target.value || undefined })}
          onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
          className={box}
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
        <Menu.SubmenuRoot>
          <Menu.SubmenuTrigger
            openOnHover={false}
            aria-label="Pick a field"
            className="absolute inset-y-0 right-0 flex w-7 cursor-pointer items-center justify-center text-muted outline-none hover:text-ink"
          >
            <CaretDown className="size-4" />
          </Menu.SubmenuTrigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} className="z-50 outline-none">
              <Menu.Popup className={cn(popup, "min-w-40")}>
                <div className={list}>
                  <div className={cn(sectionLabel, "px-2.5")}>Date utilities</div>
                  <Menu.Item
                    onClick={() => set({ defaultAnswer: { field: today } })}
                    className={option}
                  >
                    Today
                  </Menu.Item>
                </div>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.SubmenuRoot>
      )}
    </div>
  );
}
