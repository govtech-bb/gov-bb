import { useRef, useState } from "react";
import ErrorMessage from "../error-message";
import { FieldRenderContext } from "./render-context";

/** Week rows, Monday first — matching how opening hours are usually read. */
export const OPENING_HOURS_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export type OpeningHoursDay = (typeof OPENING_HOURS_DAYS)[number];

const WEEKDAYS: OpeningHoursDay[] = [...OPENING_HOURS_DAYS.slice(0, 5)];
const WEEKEND: OpeningHoursDay[] = [...OPENING_HOURS_DAYS.slice(5)];

/** A visual row of the grid: a single day, or Monday–Friday combined by the
 * "same hours every weekday" toggle. Edits to a row apply to every day it
 * covers, so the stored value stays plain per-day entries. */
interface DayRow {
  key: string;
  label: string;
  days: OpeningHoursDay[];
}

const WEEKDAYS_ROW: DayRow = {
  key: "weekdays",
  label: "Monday to Friday",
  days: WEEKDAYS,
};

const perDayRow = (day: OpeningHoursDay): DayRow => ({
  key: day,
  label: day,
  days: [day],
});

/** One set of hours; halves are "" until the applicant picks a time. */
export interface HoursSet {
  start: string;
  end: string;
}

export type WeekHours = Record<OpeningHoursDay, HoursSet[]>;

/** Mirrors the old per-day fieldArray cap (split shifts rarely need more). */
const MAX_SETS_PER_DAY = 3;

// One stored entry: "Monday 09:00 - 17:00". Halves are optional so a set
// that is added but not yet completed still round-trips through form state;
// the registry component's pattern rule rejects those partial entries on
// submit.
const ENTRY_PATTERN = new RegExp(
  `^(${OPENING_HOURS_DAYS.join("|")})\\s*(\\d{1,2}:\\d{2})?\\s*-\\s*(\\d{1,2}:\\d{2})?$`,
);

/** Parse the stored string array back into per-day sets of hours. Entries
 * that don't parse (e.g. hand-crafted drafts) are dropped rather than
 * crashing the step. */
export function parseOpeningHours(value: unknown): WeekHours {
  const week = Object.fromEntries(
    OPENING_HOURS_DAYS.map((day) => [day, [] as HoursSet[]]),
  ) as WeekHours;
  if (!Array.isArray(value)) return week;
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const match = ENTRY_PATTERN.exec(entry.trim());
    if (!match) continue;
    const [, day, start, end] = match;
    week[day as OpeningHoursDay].push({ start: start ?? "", end: end ?? "" });
  }
  return week;
}

/** Serialize per-day sets back to the stored "Monday 09:00 - 17:00" entries,
 * Monday-first regardless of the order sets were added in. */
export function serializeOpeningHours(week: WeekHours): string[] {
  return OPENING_HOURS_DAYS.flatMap((day) =>
    week[day].map(({ start, end }) =>
      `${day} ${start} - ${end}`.replace(/ {2,}/g, " ").trimEnd(),
    ),
  );
}

const hoursSetsEqual = (a: HoursSet[], b: HoursSet[]): boolean =>
  a.length === b.length &&
  a.every((set, i) => set.start === b[i].start && set.end === b[i].end);

/** True when every weekday holds the same, non-empty sets of hours — the
 * stored value carries no flag for the "same hours every weekday" toggle, so
 * on remount the combined row is restored by recognising its effect. */
export function weekdaysShareHours(week: WeekHours): boolean {
  const [monday, ...rest] = WEEKDAYS.map((day) => week[day]);
  return (
    monday.length > 0 && rest.every((sets) => hoursSetsEqual(sets, monday))
  );
}

/**
 * Weekly opening-hours grid (#2358): one row per day (or one combined
 * Monday–Friday row), native time pickers per set of hours, and "Not open"
 * for days with nothing. Open-24-hours is hint guidance (enter 12:00 AM to
 * 11:59 PM), not a control — the format rule rejects an equal open and
 * close, so "00:00 - 00:00" cannot stand in for it. A proper
 * component (not a render function like its siblings) because add/remove
 * move focus and feed a polite status region, which needs refs and state.
 */
export function OpeningHoursField({ ctx }: { ctx: FieldRenderContext }) {
  const {
    field,
    f,
    commitChange,
    invalid,
    hintId,
    errorId,
    errorMessage,
    labelClass,
    labelSuffix,
    describedBy,
  } = ctx;

  const week = parseOpeningHours(f.state.value);

  // Screen-reader announcement for add/remove; visually hidden.
  const [status, setStatus] = useState("");
  // The toggle isn't part of the answer; it is re-derived from the committed
  // value so navigating away and back keeps the combined weekday row.
  const [sameWeekdayHours, setSameWeekdayHours] = useState(() =>
    weekdaysShareHours(parseOpeningHours(f.state.value)),
  );
  // After "Add hours", focus lands on the new set's opening time.
  const pendingFocus = useRef<string | null>(null);
  const addButtons = useRef(new Map<string, HTMLButtonElement>());
  // Set when a row was at max sets on remove: its "Add hours" button only
  // mounts on the next render, so the ref callback finishes the focus move.
  const pendingAddFocus = useRef<string | null>(null);

  const rows: DayRow[] = sameWeekdayHours
    ? [WEEKDAYS_ROW, ...WEEKEND.map(perDayRow)]
    : OPENING_HOURS_DAYS.map(perDayRow);

  // A row's sets are its first day's — commits keep a combined row's days
  // identical, so any of them is the row's truth.
  const rowSets = (row: DayRow) => week[row.days[0]];

  /** Write `sets` to every day the row covers. */
  const commitRow = (row: DayRow, sets: HoursSet[]) =>
    commitChange(
      serializeOpeningHours({
        ...week,
        ...Object.fromEntries(row.days.map((day) => [day, sets])),
      }),
    );

  const toggleSameWeekdayHours = (checked: boolean) => {
    if (checked) {
      // The first weekday that already has hours becomes the shared set, so
      // ticking the box after filling Monday spreads Monday's hours.
      const template =
        WEEKDAYS.map((day) => week[day]).find((sets) => sets.length > 0) ?? [];
      commitChange(
        serializeOpeningHours({
          ...week,
          ...Object.fromEntries(WEEKDAYS.map((day) => [day, template])),
        }),
      );
      setStatus("The same hours now apply Monday to Friday.");
    } else {
      // The days keep the shared hours; they just become editable per day.
      setStatus("Weekday hours can now be set day by day.");
    }
    setSameWeekdayHours(checked);
  };

  const addHours = (row: DayRow) => {
    const count = rowSets(row).length;
    pendingFocus.current = `${row.key}-${count}-start`;
    // Numbered so back-to-back announcements are never identical — a
    // repeated string is skipped by some screen readers.
    setStatus(`Set ${count + 1} of hours added for ${row.label}.`);
    commitRow(row, [...rowSets(row), { start: "", end: "" }]);
  };

  const removeHours = (row: DayRow, index: number) => {
    const remaining = rowSets(row).length - 1;
    setStatus(
      remaining === 0
        ? `Hours removed. ${row.label} is now not open.`
        : `Hours removed for ${row.label}. ${remaining} set${remaining > 1 ? "s" : ""} left.`,
    );
    commitRow(
      row,
      rowSets(row).filter((_, i) => i !== index),
    );
    const addButton = addButtons.current.get(row.key);
    if (addButton) addButton.focus();
    else pendingAddFocus.current = row.key;
  };

  const updateHours = (
    row: DayRow,
    index: number,
    half: keyof HoursSet,
    value: string,
  ) => {
    commitRow(
      row,
      rowSets(row).map((set, i) =>
        i === index ? { ...set, [half]: value } : set,
      ),
    );
  };

  const timeInput = (
    row: DayRow,
    index: number,
    half: keyof HoursSet,
    setsCount: number,
  ) => {
    const focusKey = `${row.key}-${index}-${half}`;
    const halfName = half === "start" ? "opening" : "closing";
    const setSuffix = setsCount > 1 ? `, set ${index + 1}` : "";
    return (
      <div className="govbb-input-wrapper">
        <input
          type="time"
          className="govbb-input"
          value={rowSets(row)[index][half]}
          step={field.step}
          disabled={field.disabled}
          onBlur={f.handleBlur}
          // Only the halves the applicant still has to fix are marked
          // invalid — an empty picker, or both when open equals close — so
          // a format error doesn't paint valid times red.
          aria-invalid={
            invalid &&
            (rowSets(row)[index][half] === "" ||
              rowSets(row)[index].start === rowSets(row)[index].end)
              ? true
              : undefined
          }
          aria-label={`${row.label} ${halfName} time${setSuffix}`}
          onChange={(e) => updateHours(row, index, half, e.target.value)}
          ref={(el) => {
            if (el && pendingFocus.current === focusKey) {
              pendingFocus.current = null;
              el.focus();
            }
          }}
        />
      </div>
    );
  };

  return (
    <fieldset
      className="govbb-fieldset opening-hours"
      id={field.id}
      aria-describedby={describedBy}
    >
      <legend className={labelClass("govbb-fieldset__legend")}>
        {field.label}
        {labelSuffix}
      </legend>
      {field.hint && (
        <p className="govbb-hint" id={hintId}>
          {field.hint}
        </p>
      )}
      <ErrorMessage id={errorId} message={errorMessage} />
      <div className="govbb-checkbox-item opening-hours__same-weekdays">
        <input
          type="checkbox"
          id={`${field.id}-same-weekday-hours`}
          className="govbb-checkbox"
          checked={sameWeekdayHours}
          disabled={field.disabled}
          onChange={(e) => toggleSameWeekdayHours(e.target.checked)}
        />
        <label
          className="govbb-checkbox-item__label"
          htmlFor={`${field.id}-same-weekday-hours`}
        >
          The hours are the same every weekday (Monday to Friday)
        </label>
      </div>
      <div className="opening-hours__week">
        {rows.map((row) => {
          const sets = rowSets(row);
          return (
            <div key={row.key} className="opening-hours__day">
              <span className="opening-hours__day-name">{row.label}</span>
              <div className="opening-hours__sets">
                {sets.length === 0 ? (
                  <span className="opening-hours__not-open">Not open</span>
                ) : (
                  sets.map((_, index) => (
                    <div key={index} className="opening-hours__set">
                      {timeInput(row, index, "start", sets.length)}
                      <span aria-hidden="true">to</span>
                      {timeInput(row, index, "end", sets.length)}
                      <button
                        type="button"
                        className="govbb-btn--destructive-link"
                        disabled={field.disabled}
                        onClick={() => removeHours(row, index)}
                      >
                        Remove{" "}
                        <span className="govbb-visually-hidden">
                          {sets.length > 1
                            ? `set ${index + 1} of hours for ${row.label}`
                            : `hours for ${row.label}`}
                        </span>
                      </button>
                    </div>
                  ))
                )}
              </div>
              {sets.length < MAX_SETS_PER_DAY && (
                <button
                  type="button"
                  className="govbb-btn--tertiary opening-hours__add"
                  disabled={field.disabled}
                  onClick={() => addHours(row)}
                  ref={(el) => {
                    if (el) addButtons.current.set(row.key, el);
                    else addButtons.current.delete(row.key);
                    if (el && pendingAddFocus.current === row.key) {
                      pendingAddFocus.current = null;
                      el.focus();
                    }
                  }}
                >
                  Add hours{" "}
                  <span className="govbb-visually-hidden">for {row.label}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="govbb-visually-hidden" role="status">
        {status}
      </div>
    </fieldset>
  );
}
