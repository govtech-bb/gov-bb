import {
  CaretLeftIcon,
  CaretRightIcon,
  GlobeHemisphereWestIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { cn } from "../utils/cn";
import { Button } from "../button/button";
/** DateRangePicker size and variant definitions mapping names to their Tailwind classes. */
const dateRangePickerStyles = {
  size: {
    sm: {
      classes: "p-3 gap-2",
      cellHeight: "h-6",
      cellWidth: "w-6",
      calendarWidth: "w-[168px]",
      textSize: "text-xs",
      iconSize: 14,
    },
    base: {
      classes: "p-4 gap-2.5",
      cellHeight: "h-7",
      cellWidth: "w-7",
      calendarWidth: "w-[196px]",
      textSize: "text-sm",
      iconSize: 16,
    },
    lg: {
      classes: "p-5 gap-3",
      cellHeight: "h-[32px]",
      cellWidth: "w-9",
      calendarWidth: "w-[252px]",
      textSize: "text-base",
      iconSize: 18,
    },
  },
  variant: {
    default: {
      classes: "bg-ui-base ring ring-ui-hairline",
    },
    subtle: {
      classes: "bg-ui-tint",
    },
  },
} as const;
export type DateRangePickerSize = keyof typeof dateRangePickerStyles.size;
export type DateRangePickerVariant = keyof typeof dateRangePickerStyles.variant;
export interface DateRangePickerVariantsProps {
  /**
   * Calendar size.
   * - `"sm"` — Compact calendar for tight spaces
   * - `"base"` — Default calendar size
   * - `"lg"` — Large calendar for prominent date selection
   * @default "base"
   */
  size?: DateRangePickerSize;
  /**
   * Visual variant.
   * - `"default"` — Surface with a subtle border
   * - `"subtle"` — Muted background
   * @default "default"
   */
  variant?: DateRangePickerVariant;
}
export function dateRangePickerVariants({
  size = "base",
  variant = "default",
}: DateRangePickerVariantsProps = {}) {
  return cn(
    // Base styles
    "flex w-fit max-w-full flex-col rounded-xl select-none",
    // Apply variant and size styles
    dateRangePickerStyles.variant[variant].classes,
    dateRangePickerStyles.size[size].classes,
  );
}
// Helper to get size config
function getSizeConfig(size: DateRangePickerSize) {
  return dateRangePickerStyles.size[size];
}
enum DateRangeCellMode {
  OUT_OF_RANGE,
  ENABLED,
  SELECTED_START_NODE,
  SELECTED_END_NODE,
  SELECTED,
  SELECTED_OUT_OF_RANGE,
}
const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
export interface DateRangePickerProps extends DateRangePickerVariantsProps {
  /** Callback fired when start date changes. Receives `null` on reset. */
  onStartDateChange: (date: Date | null) => void;
  /** Callback fired when end date changes. Receives `null` on reset. */
  onEndDateChange: (date: Date | null) => void;
  /**
   * Display timezone string shown in the footer.
   * @default "Barbados (GMT-4)"
   */
  timezone?: string;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
}
export function DateRangePicker({
  onStartDateChange,
  onEndDateChange,
  size = "base",
  variant = "default",
  timezone = "Barbados (GMT-4)",
  className,
}: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [viewingMonth, setViewingMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [hoveringDate, setHoveringDate] = useState<Date | null>(null);
  const sizeConfig = getSizeConfig(size);
  const handleStartDateChange = (date: Date | null) => {
    setStartDate(date);
    onStartDateChange(date); // Pass the updated startDate to the parent component
  };
  const handleEndDateChange = (date: Date | null) => {
    setEndDate(date);
    onEndDateChange(date); // Pass the updated endDate to the parent component
  };
  const handleDateSelect = (date: Date) => {
    if (!startDate || endDate || date < startDate) {
      handleStartDateChange(date);
      handleEndDateChange(null);
      setHoveringDate(date);
    } else {
      handleEndDateChange(date);
      setHoveringDate(null);
    }
  };
  const handleDateHover = (date: Date) => {
    setHoveringDate(startDate && !endDate && date > startDate ? date : null);
  };
  const getMonthName = useCallback((date: Date, monthOffset?: number) => {
    const copyDate = new Date(date);
    copyDate.setMonth(copyDate.getMonth() + (monthOffset || 0));
    return copyDate.toLocaleString("default", { month: "long" });
  }, []);
  const getDateYear = useCallback((date: Date, monthOffset?: number) => {
    const copyDate = new Date(date);
    copyDate.setMonth(copyDate.getMonth() + (monthOffset || 0));
    return copyDate.getFullYear();
  }, []);
  const getMonthsStartingDay = useCallback(
    (date: Date, monthOffset?: number) => {
      const copyDate = new Date(date);
      copyDate.setDate(1);
      copyDate.setMonth(copyDate.getMonth() + (monthOffset || 0));
      return copyDate.getDay();
    },
    [],
  );
  const getNumberOfDaysInMonth = useCallback(
    (date: Date, monthOffset?: number) => {
      const copyDate = new Date(date);
      copyDate.setDate(1);
      copyDate.setMonth(copyDate.getMonth() + (monthOffset || 0));
      copyDate.setMonth(copyDate.getMonth() + 1);
      copyDate.setDate(0);
      return copyDate.getDate();
    },
    [],
  );
  const adjustMonth = useCallback((monthOffset: number) => {
    setViewingMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + monthOffset);
      return newDate;
    });
  }, []);
  const getDateFromIndex = useCallback(
    (date: Date, monthOffset: number, index: number) => {
      const startingDay = getMonthsStartingDay(date, monthOffset);
      return new Date(
        date.getFullYear(),
        date.getMonth() + monthOffset,
        index - startingDay + 1,
      );
    },
    [getMonthsStartingDay],
  );
  const isDateEqual = useCallback((date1: Date | null, date2: Date | null) => {
    if (!date1 || !date2) return false;
    return date1.toDateString() === date2.toDateString();
  }, []);
  return (
    <div className={cn(dateRangePickerVariants({ size, variant }), className)}>
      <div
        className="flex flex-wrap gap-4"
        onMouseLeave={() => setHoveringDate(null)}
      >
        <div className={cn("relative max-w-full", sizeConfig.calendarWidth)}>
          <Button
            size="sm"
            shape="square"
            variant="outline"
            aria-label="Previous month"
            className="absolute top-0 left-0 z-10"
            onClick={() => adjustMonth(-1)}
          >
            <CaretLeftIcon size={sizeConfig.iconSize} />
          </Button>

          <DateRangeMonthHeader
            month={getMonthName(viewingMonth)}
            year={getDateYear(viewingMonth)}
            size={size}
            updateCurrentMonth={setViewingMonth}
          />

          <div className="grid grid-cols-7 gap-0 gap-y-0.5">
            {Array.from({ length: 42 }).map((_, index) => (
              <DateRangeDayCell
                key={index}
                date={getDateFromIndex(viewingMonth, 0, index)}
                size={size}
                mode={
                  // After current month range
                  (startDate &&
                    endDate &&
                    getDateFromIndex(viewingMonth, 0, index) >= startDate &&
                    getDateFromIndex(viewingMonth, 0, index) <= endDate &&
                    index >
                      getNumberOfDaysInMonth(viewingMonth, 0) +
                        getMonthsStartingDay(viewingMonth, 0) -
                        1) ||
                  // Before current month range
                  (startDate &&
                    endDate &&
                    getDateFromIndex(viewingMonth, 0, index) >= startDate &&
                    getDateFromIndex(viewingMonth, 0, index) <= endDate &&
                    index < getMonthsStartingDay(viewingMonth, 0))
                    ? DateRangeCellMode.SELECTED_OUT_OF_RANGE
                    : // Before current month range
                      index < getMonthsStartingDay(viewingMonth, 0)
                      ? DateRangeCellMode.OUT_OF_RANGE
                      : // After current month range
                        index >
                          getNumberOfDaysInMonth(viewingMonth, 0) +
                            getMonthsStartingDay(viewingMonth, 0) -
                            1
                        ? DateRangeCellMode.OUT_OF_RANGE
                        : // Selected start date
                          isDateEqual(
                              getDateFromIndex(viewingMonth, 0, index),
                              startDate,
                            )
                          ? DateRangeCellMode.SELECTED_START_NODE
                          : // Selected end date
                            isDateEqual(
                                getDateFromIndex(viewingMonth, 0, index),
                                endDate,
                              )
                            ? DateRangeCellMode.SELECTED_END_NODE
                            : // Selected date range
                              startDate &&
                                getDateFromIndex(viewingMonth, 0, index) >=
                                  startDate &&
                                endDate &&
                                getDateFromIndex(viewingMonth, 0, index) <=
                                  endDate
                              ? DateRangeCellMode.SELECTED
                              : // Hovering past a starting date and no end date selected
                                startDate &&
                                  !endDate &&
                                  hoveringDate &&
                                  hoveringDate > startDate &&
                                  getDateFromIndex(viewingMonth, 0, index) <=
                                    hoveringDate &&
                                  getDateFromIndex(viewingMonth, 0, index) >
                                    startDate
                                ? DateRangeCellMode.SELECTED
                                : // Default to enabled date
                                  DateRangeCellMode.ENABLED
                }
                onClick={handleDateSelect}
                isHoveringDate={handleDateHover}
              />
            ))}
          </div>
        </div>
        <div className={cn("relative max-w-full", sizeConfig.calendarWidth)}>
          <Button
            size="sm"
            shape="square"
            variant="outline"
            aria-label="Next month"
            className="absolute top-0 right-0 z-10"
            onClick={() => adjustMonth(1)}
          >
            <CaretRightIcon size={sizeConfig.iconSize} />
          </Button>

          <DateRangeMonthHeader
            month={getMonthName(viewingMonth, 1)}
            year={getDateYear(viewingMonth, 1)}
            size={size}
            updateCurrentMonth={(date) => {
              setViewingMonth(
                new Date(date.getFullYear(), date.getMonth() - 1, 1),
              );
            }}
          />

          <div className="grid grid-cols-7 gap-0 gap-y-0.5">
            {Array.from({ length: 42 }).map((_, index) => (
              <DateRangeDayCell
                key={index}
                date={getDateFromIndex(viewingMonth, 1, index)}
                size={size}
                mode={
                  // After current month range
                  (startDate &&
                    endDate &&
                    getDateFromIndex(viewingMonth, 1, index) >= startDate &&
                    getDateFromIndex(viewingMonth, 1, index) <= endDate &&
                    index >
                      getNumberOfDaysInMonth(viewingMonth, 1) +
                        getMonthsStartingDay(viewingMonth, 1) -
                        1) ||
                  // Before current month range
                  (startDate &&
                    endDate &&
                    getDateFromIndex(viewingMonth, 1, index) >= startDate &&
                    getDateFromIndex(viewingMonth, 1, index) <= endDate &&
                    index < getMonthsStartingDay(viewingMonth, 1))
                    ? DateRangeCellMode.SELECTED_OUT_OF_RANGE
                    : // Before current month range
                      index < getMonthsStartingDay(viewingMonth, 1)
                      ? DateRangeCellMode.OUT_OF_RANGE
                      : // After current month range
                        index >
                          getNumberOfDaysInMonth(viewingMonth, 1) +
                            getMonthsStartingDay(viewingMonth, 1) -
                            1
                        ? DateRangeCellMode.OUT_OF_RANGE
                        : // Selected start date
                          isDateEqual(
                              getDateFromIndex(viewingMonth, 1, index),
                              startDate,
                            )
                          ? DateRangeCellMode.SELECTED_START_NODE
                          : // Selected end date
                            isDateEqual(
                                getDateFromIndex(viewingMonth, 1, index),
                                endDate,
                              )
                            ? DateRangeCellMode.SELECTED_END_NODE
                            : // Selected date range
                              startDate &&
                                getDateFromIndex(viewingMonth, 1, index) >=
                                  startDate &&
                                endDate &&
                                getDateFromIndex(viewingMonth, 1, index) <=
                                  endDate
                              ? DateRangeCellMode.SELECTED
                              : // Hovering past a starting date and no end date selected
                                startDate &&
                                  !endDate &&
                                  hoveringDate &&
                                  hoveringDate > startDate &&
                                  getDateFromIndex(viewingMonth, 1, index) <=
                                    hoveringDate &&
                                  getDateFromIndex(viewingMonth, 1, index) >
                                    startDate
                                ? DateRangeCellMode.SELECTED
                                : // Default to enabled date
                                  DateRangeCellMode.ENABLED
                }
                onClick={handleDateSelect}
                isHoveringDate={handleDateHover}
              />
            ))}
          </div>
        </div>
      </div>

      <DateRangeFooter
        timezone={timezone}
        size={size}
        reset={() => {
          handleStartDateChange(null);
          handleEndDateChange(null);
          setHoveringDate(null);
        }}
      />
    </div>
  );
}
function DateRangeDayCell({
  date,
  mode,
  size = "base",
  onClick,
  isHoveringDate,
}: {
  date: Date;
  mode?: DateRangeCellMode;
  size?: DateRangePickerSize;
  onClick?: (date: Date) => void;
  isHoveringDate?: (date: Date) => void;
}) {
  const sizeConfig = getSizeConfig(size);
  const getDateNumberFromDate = useCallback((date: Date) => {
    return date.getDate();
  }, []);
  const getBackgroundColor = useCallback(() => {
    switch (mode) {
      case DateRangeCellMode.OUT_OF_RANGE:
        return "bg-transparent";
      case DateRangeCellMode.ENABLED:
        return "bg-transparent";
      case DateRangeCellMode.SELECTED_START_NODE:
        return "!bg-ui-contrast rounded-tl-[5px] rounded-bl-[5px]";
      case DateRangeCellMode.SELECTED_END_NODE:
        return "!bg-ui-contrast rounded-tr-[5px] rounded-br-[5px]";
      case DateRangeCellMode.SELECTED:
        return "bg-ui-tint";
      case DateRangeCellMode.SELECTED_OUT_OF_RANGE:
        return "bg-ui-tint";
    }
  }, [mode]);
  const getTextColor = useCallback(() => {
    switch (mode) {
      case DateRangeCellMode.OUT_OF_RANGE:
      case DateRangeCellMode.SELECTED_OUT_OF_RANGE:
        return "!text-ui-subtle";
      case DateRangeCellMode.SELECTED_START_NODE:
      case DateRangeCellMode.SELECTED_END_NODE:
        return "!text-ui-inverse";
      default:
        return "text-ui-default";
    }
  }, [mode]);
  const getAriaLabel = useCallback(() => {
    const dateStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    switch (mode) {
      case DateRangeCellMode.SELECTED_START_NODE:
        return `${dateStr}, selected as start date`;
      case DateRangeCellMode.SELECTED_END_NODE:
        return `${dateStr}, selected as end date`;
      case DateRangeCellMode.SELECTED:
        return `${dateStr}, within selected range`;
      default:
        return dateStr;
    }
  }, [date, mode]);
  return (
    <button
      type="button"
      data-ui-component="CalendarDay"
      aria-label={getAriaLabel()}
      className={cn(
        sizeConfig.cellHeight,
        sizeConfig.cellWidth,
        sizeConfig.textSize,
        "flex max-w-full cursor-pointer items-center justify-center text-ui-default transition-colors duration-50 focus-visible:outline-2 focus-visible:outline-ui-brand",
        mode !== DateRangeCellMode.OUT_OF_RANGE &&
          mode !== DateRangeCellMode.SELECTED_OUT_OF_RANGE
          ? "hover:bg-ui-tint"
          : "",
        getBackgroundColor(),
        getTextColor(),
      )}
      onClick={() => onClick?.(date)}
      onMouseOver={() => isHoveringDate?.(date)}
      onFocus={() => isHoveringDate?.(date)}
    >
      {getDateNumberFromDate(date)}
    </button>
  );
}
function DateRangeMonthHeader({
  month,
  year,
  size = "base",
  updateCurrentMonth,
}: {
  month?: string;
  year?: number;
  size?: DateRangePickerSize;
  updateCurrentMonth?: (date: Date) => void;
}) {
  const sizeConfig = getSizeConfig(size);
  return (
    <div>
      <div className="mb-3 text-center">
        <input
          data-ui-component="CalendarMonth"
          key={`${month}-${year}`}
          aria-label="Edit month and year"
          defaultValue={`${month} ${year}`}
          className={cn(
            "w-full rounded-md border-none bg-transparent py-1.5 text-center font-semibold text-ui-default transition-all duration-200 focus:ring-[1.5px] focus:ring-ui-focus/50 focus:outline-none",
            sizeConfig.textSize,
          )}
          onBlur={(e) => {
            const date = new Date(e.currentTarget.value);
            if (Number.isNaN(date.getTime())) {
              e.currentTarget.value = `${month} ${year}`;
              return;
            }
            updateCurrentMonth?.(
              new Date(date.getFullYear(), date.getMonth(), 1),
            );
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      <div className="mt-2 grid grid-cols-7">
        {DAYS_OF_WEEK.map((day) => (
          <div
            key={day}
            className={cn(
              "h-[22px] max-w-full text-center text-ui-subtle",
              sizeConfig.cellWidth,
              sizeConfig.textSize,
            )}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}
function DateRangeFooter({
  timezone,
  size = "base",
  reset,
}: {
  timezone?: string;
  size?: DateRangePickerSize;
  reset?: () => void;
}) {
  const sizeConfig = getSizeConfig(size);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-ui-subtle",
        sizeConfig.textSize,
      )}
    >
      <GlobeHemisphereWestIcon size={sizeConfig.iconSize} />
      <span className="flex-1">Timezone: {timezone}</span>
      <button
        type="button"
        data-ui-component="CalendarReset"
        onClick={reset}
        className="cursor-pointer font-semibold text-ui-default underline underline-offset-2"
      >
        Reset Dates
      </button>
    </div>
  );
}
// Default export for backwards compatibility
export default DateRangePicker;
