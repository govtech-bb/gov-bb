/**
 * The bank holiday calendar.
 *
 * Ported feature-for-feature from the live page at
 * /bank-holiday-calendar, which does considerably more than list dates:
 *
 * - the next holiday is called out with a countdown, because "when is the
 *   next one" is the question almost everyone arrives with;
 * - the year moves by Previous/Next rather than a dropdown, so the common
 *   move is one click and the bounds are visible;
 * - a substitution is shown **against the holiday it substitutes for**, not
 *   as a separate row. "Public Holiday in lieu of Christmas Day" listed on
 *   its own tells you nothing about why it exists;
 * - upcoming and past are separated, and past is muted, so the current year
 *   reads as a calendar rather than an archive.
 *
 * What is configuration and what is behaviour is worth being explicit
 * about. The columns, the year range and the substitution policy are block
 * fields an author sets. The hero, the countdown and the upcoming/past
 * split are renderer behaviour — an author cannot turn the countdown off,
 * because there is no field for it, and inventing one would be guessing at
 * a need nobody has expressed.
 */

import { Table, TableCell, TableHeader } from "@govtech-bb/react";
import { useMemo, useState } from "react";
import {
  daysBetween,
  fmtDayOfWeek,
  fmtFullDate,
  fmtSubstituteDate,
  startOfDay,
} from "../dates";
import {
  holidaysForYear,
  type Holiday,
  type HolidayRuleRecord,
} from "../holidays";
import type { CalendarBlock } from "../types";
import type { RenderContext } from "./spans";

const shortDate = (d: Date) =>
  `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;

/** "Public Holiday in lieu of X" → X. */
const IN_LIEU = /^Public Holiday in lieu of (.+)$/;

export function CalendarIsland({
  block,
  ctx,
  today = new Date(),
}: {
  block: CalendarBlock;
  ctx: RenderContext;
  today?: Date;
}) {
  // Memoised: `ctx.data[key] ?? []` is a fresh array on every render, which
  // would make everything below recompute each time.
  const rules = useMemo(
    () => (ctx.data[block.collection] ?? []) as unknown as HolidayRuleRecord[],
    [ctx.data, block.collection],
  );

  const now = useMemo(() => startOfDay(today), [today]);
  const thisYear = now.getUTCFullYear();
  const { min, max } = block.year_range;
  const [year, setYear] = useState(() =>
    Math.min(Math.max(thisYear, min), max),
  );

  const { upcoming, past, substituteFor, nextHoliday } = useMemo(() => {
    const all = holidaysForYear(rules, year, block.substitution_rule);

    // A substitution belongs to the holiday it stands in for, not to a row
    // of its own.
    const byParent = new Map<string, Holiday>();
    for (const holiday of all) {
      const parent = holiday.substitute
        ? IN_LIEU.exec(holiday.name)?.[1]
        : undefined;
      if (parent) byParent.set(parent, holiday);
    }

    const listed = all.filter((holiday) => !holiday.substitute);
    const isThisYear = year === thisYear;

    return {
      substituteFor: byParent,
      upcoming: isThisYear
        ? listed.filter((holiday) => holiday.date >= now)
        : listed,
      past: isThisYear ? listed.filter((holiday) => holiday.date < now) : [],
      nextHoliday: isThisYear
        ? listed.find((holiday) => holiday.date >= now)
        : undefined,
    };
  }, [rules, year, block.substitution_rule, now, thisYear]);

  if (ctx.loading) {
    return <p className="bk-empty">Loading…</p>;
  }

  return (
    <div className="bk-calendar">
      <div className="bk-calendar-head">
        <YearSwitcher year={year} min={min} max={max} onChange={setYear} />
      </div>

      {nextHoliday ? (
        <NextHolidayHero holiday={nextHoliday} today={now} />
      ) : null}

      <HolidaySection
        heading={year === thisYear ? "Still to come" : `Holidays in ${year}`}
        holidays={upcoming}
        block={block}
        substituteFor={substituteFor}
        emptyMessage={`No holidays left in ${year}.`}
      />

      {block.show_past && past.length > 0 ? (
        <HolidaySection
          heading="Already been"
          holidays={past}
          block={block}
          substituteFor={substituteFor}
          muted
        />
      ) : null}
    </div>
  );
}

function YearSwitcher({
  year,
  min,
  max,
  onChange,
}: {
  year: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <fieldset className="bk-year-switcher" aria-label="Choose a year">
      <button
        type="button"
        className="bk-year-button"
        disabled={year <= min}
        aria-label={`Previous year, ${year - 1}`}
        onClick={() => onChange(year - 1)}
      >
        ‹ {year - 1}
      </button>
      <strong className="bk-year-current" aria-live="polite">
        {year}
      </strong>
      <button
        type="button"
        className="bk-year-button"
        disabled={year >= max}
        aria-label={`Next year, ${year + 1}`}
        onClick={() => onChange(year + 1)}
      >
        {year + 1} ›
      </button>
    </fieldset>
  );
}

function NextHolidayHero({
  holiday,
  today,
}: {
  holiday: Holiday;
  today: Date;
}) {
  const days = daysBetween(today, holiday.date);
  const countdown =
    days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days away`;

  return (
    <section className="bk-next-holiday" aria-label="Next bank holiday">
      <span className="bk-next-tag">Next bank holiday</span>
      <h3 className="bk-next-name">{holiday.name}</h3>
      <p className="bk-next-date">{fmtFullDate(holiday.date)}</p>
      <p className="bk-next-countdown">{countdown}</p>
    </section>
  );
}

function HolidaySection({
  heading,
  holidays,
  block,
  substituteFor,
  muted,
  emptyMessage,
}: {
  heading: string;
  holidays: Holiday[];
  block: CalendarBlock;
  substituteFor: Map<string, Holiday>;
  muted?: boolean;
  emptyMessage?: string;
}) {
  if (holidays.length === 0) {
    return emptyMessage ? <p className="bk-empty">{emptyMessage}</p> : null;
  }

  return (
    <section className={muted ? "bk-holidays bk-holidays-past" : "bk-holidays"}>
      <h3 className="bk-holidays-heading">
        {heading}
        <span className="bk-chip">{holidays.length}</span>
      </h3>

      {/*
        The caption names this section, not the page. Two tables sharing one
        accessible name is indistinguishable to anyone navigating by table.
      */}
      <Table
        scrollable
        caption={`Bank holidays — ${heading.toLowerCase()}`}
        scrollLabel={`Bank holidays — ${heading.toLowerCase()}`}
      >
        <thead>
          <tr>
            {block.columns.map((column) => (
              <TableHeader key={column.field} scope="col">
                {column.label}
              </TableHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {holidays.map((holiday, index) => {
            const substitute = substituteFor.get(holiday.name);
            return (
              <tr key={`${holiday.name}-${index}`}>
                {block.columns.map((column) => (
                  <TableCell key={column.field}>
                    <Cell column={column} holiday={holiday} />
                    {/*
                      The substitution rides with the holiday's name, which
                      is the only place it makes sense: it explains why the
                      day off moved, rather than appearing as an unexplained
                      extra row.
                    */}
                    {column.field === "name" && substitute ? (
                      <span className="bk-substitute-note">
                        Substitute day: {fmtSubstituteDate(substitute.date)}
                      </span>
                    ) : null}
                  </TableCell>
                ))}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </section>
  );
}

function Cell({
  column,
  holiday,
}: {
  column: CalendarBlock["columns"][number];
  holiday: Holiday;
}) {
  switch (column.field) {
    case "date":
      return (
        <>
          {column.format === "short_date"
            ? shortDate(holiday.date)
            : fmtFullDate(holiday.date)}
        </>
      );
    case "day":
      return <>{fmtDayOfWeek(holiday.date)}</>;
    case "name":
      return <>{holiday.name}</>;
    case "note":
      return <>{holiday.note ?? ""}</>;
    default:
      return null;
  }
}
