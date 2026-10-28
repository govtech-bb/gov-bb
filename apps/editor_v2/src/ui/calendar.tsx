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
import { Button } from "./button";
import { hiddenControlFocus } from "./focus";

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

// What a mode shows, and what a press on a day makes of it: react-day-picker's next value, then the day pressed, for a
// caller that draws a value of its own, such as everything before a date as a range
type Selection =
  | {
      mode: "single";
      value?: Date;
      onValueChange: (value: Date | undefined, day: Date) => void;
    }
  | {
      mode: "multiple";
      value?: Date[];
      onValueChange: (value: Date[] | undefined, day: Date) => void;
    }
  | {
      mode: "range";
      value?: DateRange;
      onValueChange: (value: DateRange | undefined, day: Date) => void;
    };

export type CalendarProps = Selection & {
  /** The month shown first, else today's: react-day-picker doesn't go by the value. */
  defaultMonth?: Date;
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

// The wrapper's CSS for DayPicker's parts, keeping react-day-picker's rdp-* names
const classNames: Partial<ClassNames> = {
  root: "rdp-root relative mx-1.5",
  months: "rdp-months relative flex w-full flex-1 flex-wrap gap-8",
  nav: "rdp-nav absolute inset-x-0 top-0 flex h-8 items-center justify-between",
  month: "rdp-month w-full flex-1",
  month_caption: "rdp-month_caption flex h-8 items-center text-16 font-semibold",
  dropdowns:
    "rdp-dropdowns relative mx-auto inline-flex items-center gap-2 font-semibold hover:cursor-pointer",
  // The see-through select inside takes the focus, so the ring goes around its caption
  dropdown_root: cn(
    "rdp-dropdown_root relative inline-flex items-center rounded-sm",
    hiddenControlFocus,
  ),
  // A see-through native select over the label and its ghost chevron
  dropdown:
    "rdp-dropdown absolute inset-y-0 left-0 z-2 m-0 w-full cursor-pointer appearance-none border-0 p-0 opacity-0",
  // DayPicker appends a live caption after the dropdowns, so the year dropdown is the second child.
  caption_label:
    "rdp-caption_label relative z-1 inline-flex items-center whitespace-nowrap [:nth-child(2)>&]:text-muted",
  chevron: "rdp-chevron flex aspect-square h-full items-center justify-center rounded-sm text-ink",
  month_grid: "rdp-month_grid w-full flex-1 border-collapse",
  weekdays: "rdp-weekdays h-7 text-12 font-normal text-muted",
  weekday: "rdp-weekday py-2 text-center font-semibold",
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
              "p-0 text-center text-16 text-muted",
              m.today && "text-interactive",
              !m.selected &&
                !m.disabled &&
                "hover:rounded-sm hover:bg-interactive-subtle hover:text-interactive",
              m.selected && "rounded-sm bg-interactive font-semibold text-(--color-white)!",
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
      <Button
        icon={<CaretLeft />}
        aria-label="Previous month"
        disabled={!previousMonth}
        onClick={onPreviousClick}
        className="rdp-button_previous"
      />
      <Button
        icon={<CaretRight />}
        aria-label="Next month"
        disabled={!nextMonth}
        onClick={onNextClick}
        className="rdp-button_next"
      />
    </nav>
  );
}

// A select's caret, 14px like every other
const Chevron = ({ className }: ChevronProps) => (
  <span className={className}>
    <CaretDown className="size-3.5" />
  </span>
);

const components = { Chevron, Day, Nav };

/**
 * A month of days to pick one, several or a range from. The caller keeps the value: `onValueChange` reports the next
 * one and the day pressed.
 */
export function Calendar(props: CalendarProps) {
  const { defaultMonth, weekStartsOn = 1, disabled, startMonth, endMonth } = props;

  let selection: PropsSingle | PropsMulti | PropsRange;

  if (props.mode === "single")
    selection = { mode: "single", selected: props.value, onSelect: props.onValueChange };
  else if (props.mode === "multiple")
    selection = { mode: "multiple", selected: props.value, onSelect: props.onValueChange };
  else selection = { mode: "range", selected: props.value, onSelect: props.onValueChange };

  return (
    <DayPicker
      {...selection}
      captionLayout="dropdown"
      defaultMonth={defaultMonth}
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
