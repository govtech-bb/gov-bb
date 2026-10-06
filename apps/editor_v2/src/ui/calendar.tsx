import { parseISO, type Day as Weekday, type Locale } from "date-fns";
import { enUS } from "date-fns/locale";
import { CaretDown, CaretLeft, CaretRight } from "@phosphor-icons/react";
import {
  DayPicker,
  type ChevronProps,
  type ClassNames,
  type DateRange,
  type DayProps,
  type NavProps,
  type PropsMulti,
  type PropsRange,
  type PropsSingle,
} from "react-day-picker";
import { cn } from "../cn";

export { addToRange } from "react-day-picker";

export type { DateRange };

/** Abbreviated months keep the month dropdown compact at every requested locale width. */
const locale: Locale = {
  ...enUS,
  formatLong: { ...enUS.formatLong, date: () => "MMM d, y" },
  localize: {
    ...enUS.localize,
    month: (month) => enUS.localize.month(month, { width: "abbreviated" }),
  },
};

export type CalendarProps = {
  /** Range mode displays the selected interval; single and multiple modes display individual dates. */
  mode: "single" | "multiple" | "range";
  selected?: Date | Date[] | DateRange;
  onDayClick: (day: Date) => void;
  /** The month shown first, else today's (as react-day-picker, which doesn't go by the selection). */
  month?: Date;
  /** 0 is Sunday; defaults to Monday. */
  weekStartsOn?: Weekday;
  disabled?: (day: Date) => boolean;
  /** Limits month navigation and the month/year dropdowns. */
  startMonth?: Date;
  endMonth?: Date;
};

// Use local dates so timezone conversion does not move the navigation bounds.
const [firstMonth, lastMonth] = [parseISO("0001-01-01"), parseISO("2199-12-31")];

const daySize = "size-10 max-sm:size-9 max-[320px]:size-7.5";

const navButton =
  "flex aspect-square h-full cursor-pointer items-center justify-center rounded-sm border-0 bg-tint text-ink hover:bg-line disabled:cursor-default disabled:opacity-50";

// The wrapper's CSS for DayPicker's parts, keeping react-day-picker's rdp-* names
const classNames: Partial<ClassNames> = {
  root: "rdp-root relative mx-1.5",
  months: "rdp-months relative flex w-full flex-1 flex-wrap gap-8",
  nav: "rdp-nav absolute inset-x-0 top-0 flex h-8 items-center justify-between",
  month: "rdp-month w-full flex-1",
  month_caption: "rdp-month_caption flex h-8 items-center text-18 font-bold",
  dropdowns:
    "rdp-dropdowns relative mx-auto inline-flex items-center gap-2 font-medium hover:cursor-pointer",
  dropdown_root: "rdp-dropdown_root relative inline-flex items-center",
  // A see-through native select over the label and its ghost chevron
  dropdown:
    "rdp-dropdown absolute inset-y-0 left-0 z-2 m-0 w-full cursor-pointer appearance-none border-0 p-0 opacity-0",
  // DayPicker appends a live caption after the dropdowns, so the year dropdown is the second child.
  caption_label:
    "rdp-caption_label relative z-1 inline-flex items-center whitespace-nowrap [:nth-child(2)>&]:text-muted",
  chevron: "rdp-chevron flex aspect-square h-full items-center justify-center rounded-sm text-ink",
  month_grid: "rdp-month_grid w-full flex-1 border-collapse",
  weekdays: "rdp-weekdays h-7 text-12 font-normal text-muted",
  weekday: "rdp-weekday py-2 text-center text-[smaller] font-medium opacity-75",
  day_button: cn(
    "rdp-day_button mx-auto flex cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-inherit disabled:cursor-default",
    daySize,
  ),
};

/** Range endpoints keep their outside corners rounded; intervening days form one continuous band. */
function Day({ day: _day, modifiers: m, className, ...props }: DayProps) {
  return (
    <td
      {...props}
      className={cn(
        className,
        daySize,
        m.hidden
          ? "invisible"
          : [
              "p-0 text-center text-16 font-medium text-muted",
              m.today && "text-interactive",
              !m.selected &&
                !m.disabled &&
                "hover:rounded-sm hover:bg-interactive-subtle hover:text-interactive",
              m.selected && "rounded-sm bg-interactive font-medium text-(--color-white)!",
              m.range_start && !m.range_end && "rounded-r-none",
              m.range_end && !m.range_start && "rounded-l-none",
              m.range_middle && "rounded-none bg-interactive-subtle text-interactive",
              m.disabled && !m.selected && "opacity-50",
            ],
      )}
    />
  );
}

function Nav({ onPreviousClick, onNextClick, previousMonth, nextMonth, ...props }: NavProps) {
  return (
    <nav {...props}>
      <button
        type="button"
        aria-label="Previous month"
        disabled={!previousMonth}
        onClick={onPreviousClick}
        className={cn("rdp-button_previous", navButton)}
      >
        <CaretLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Next month"
        disabled={!nextMonth}
        onClick={onNextClick}
        className={cn("rdp-button_next", navButton)}
      >
        <CaretRight className="size-4" />
      </button>
    </nav>
  );
}

const Chevron = ({ className }: ChevronProps) => (
  <span className={className}>
    <CaretDown className="size-4" />
  </span>
);

const components = { Chevron, Day, Nav };

export function Calendar({
  mode,
  selected,
  onDayClick,
  month,
  weekStartsOn = 1,
  disabled,
  startMonth,
  endMonth,
}: CalendarProps) {
  // The caller keeps the selection: a pick only reports its day
  const onSelect = (_selection: Date | Date[] | DateRange | undefined, day: Date) =>
    onDayClick(day);

  let selection: PropsSingle | PropsMulti | PropsRange;

  if (mode === "single")
    selection = { mode, selected: selected instanceof Date ? selected : undefined, onSelect };
  else if (mode === "multiple")
    selection = { mode, selected: Array.isArray(selected) ? selected : undefined, onSelect };
  else
    selection = {
      mode,
      selected: selected instanceof Date || Array.isArray(selected) ? undefined : selected,
      onSelect,
    };

  return (
    <DayPicker
      {...selection}
      captionLayout="dropdown"
      defaultMonth={month}
      startMonth={startMonth ?? firstMonth}
      endMonth={endMonth ?? lastMonth}
      weekStartsOn={weekStartsOn}
      disabled={disabled}
      locale={locale}
      classNames={classNames}
      components={components}
    />
  );
}
