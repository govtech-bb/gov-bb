/**
 * The bank holiday calendar, matched to the live page at
 * /bank-holiday-calendar.
 *
 * The live page is not a table with a year picker. It is a date tile per
 * holiday, the next one highlighted, upcoming and past separated and
 * counted, a hero answering "when is the next one", and a notice explaining
 * the substitution rules. Each of those is doing a job:
 *
 * - the tile makes the date scannable down the left edge, which "Monday,
 *   30 November 2026" sitting in a table cell does not;
 * - the highlight puts the answer to the common question in the list as
 *   well as in the hero, so it survives scrolling;
 * - the counts say how much year is left without anyone counting rows.
 *
 * Deliberately NOT built from the design system's Table. This is a grid of
 * cards, not tabular data, and forcing it through Table would mean fighting
 * component styles to arrive somewhere that only looks the same. The
 * colours are the design system's own tokens, quoted in the stylesheet
 * because `block-kit` does not depend on Tailwind.
 *
 * The block's `columns` still decide WHAT appears — drop the `day` column
 * and the right-hand column goes, drop `note` and the sub-line goes — but
 * not the shape it appears in. That is the honest boundary: an author
 * chooses the content, a developer ships the layout.
 */

import { useMemo, useState } from "react";
import {
  daysBetween,
  fmtDayNum,
  fmtDayOfWeek,
  fmtFullDate,
  fmtMonthShort,
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

/** "Public Holiday in lieu of X" → X. */
const IN_LIEU = /^Public Holiday in lieu of (.+)$/;

const has = (block: CalendarBlock, field: string) =>
  block.columns.some((column) => column.field === field);

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

  const { listed, upcoming, past, substituteFor, substituteCount } =
    useMemo(() => {
      const all = holidaysForYear(rules, year, block.substitution_rule);

      // A substitution belongs to the holiday it stands in for, not to a
      // row of its own.
      const byParent = new Map<string, Holiday>();
      for (const holiday of all) {
        const parent = holiday.substitute
          ? IN_LIEU.exec(holiday.name)?.[1]
          : undefined;
        if (parent) byParent.set(parent, holiday);
      }

      const rows = all.filter((holiday) => !holiday.substitute);
      const isThisYear = year === thisYear;

      return {
        listed: rows,
        substituteFor: byParent,
        substituteCount: all.length - rows.length,
        upcoming: isThisYear
          ? rows.filter((holiday) => holiday.date >= now)
          : [],
        past: isThisYear ? rows.filter((holiday) => holiday.date < now) : [],
      };
    }, [rules, year, block.substitution_rule, now, thisYear]);

  if (ctx.loading) return <p className="bk-empty">Loading…</p>;

  const isThisYear = year === thisYear;
  const next = upcoming[0];
  const switcher = (
    <YearSwitcher year={year} min={min} max={max} onChange={setYear} />
  );

  return (
    <div className="bk-cal">
      <div className="bk-cal-switch">{switcher}</div>

      {isThisYear && next ? (
        <NextHolidayHero holiday={next} today={now} />
      ) : (
        <YearOverviewHero
          year={year}
          count={listed.length}
          variant={
            isThisYear ? "exhausted" : year < thisYear ? "past" : "future"
          }
        />
      )}

      {isThisYear ? (
        <>
          <HolidaySection
            heading={`Upcoming bank holidays ${year}`}
            chip={`${upcoming.length} remaining`}
            holidays={upcoming}
            block={block}
            substituteFor={substituteFor}
            highlightFirst
          />
          {block.show_past && past.length > 0 ? (
            <HolidaySection
              heading={`Past bank holidays ${year}`}
              chip={`${past.length} so far`}
              holidays={past}
              block={block}
              substituteFor={substituteFor}
              muted
            />
          ) : null}
        </>
      ) : (
        <HolidaySection
          heading={`All bank holidays ${year}`}
          chip={`${listed.length} ${year < thisYear ? "observed" : "scheduled"}`}
          holidays={listed}
          block={block}
          substituteFor={substituteFor}
        />
      )}

      <div className="bk-cal-switch bk-cal-switch-end">{switcher}</div>

      <SubstitutionNotice year={year} substituteCount={substituteCount} />
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
    <fieldset className="bk-years" aria-label="Choose a year">
      <button
        type="button"
        className="bk-year"
        disabled={year <= min}
        aria-label={`Previous year, ${year - 1}`}
        onClick={() => onChange(year - 1)}
      >
        <Chevron direction="left" />
        <span className="bk-year-text">
          <span className="bk-year-label">Previous</span>
          <span className="bk-year-value">{year - 1}</span>
        </span>
      </button>
      <button
        type="button"
        className="bk-year"
        disabled={year >= max}
        aria-label={`Next year, ${year + 1}`}
        onClick={() => onChange(year + 1)}
      >
        <span className="bk-year-text bk-year-text-end">
          <span className="bk-year-label">Next</span>
          <span className="bk-year-value">{year + 1}</span>
        </span>
        <Chevron direction="right" />
      </button>
    </fieldset>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      className="bk-chevron"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline
        points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"}
      />
    </svg>
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

  return (
    <section className="bk-hero" aria-label="Next bank holiday">
      <span className="bk-hero-tag">Next bank holiday</span>
      <h3 className="bk-hero-name">{holiday.name}</h3>
      <p className="bk-hero-date">{fmtFullDate(holiday.date)}</p>
      <p className="bk-hero-count">
        {days === 0 || days === 1 ? (
          <strong>{days === 0 ? "Today" : "Tomorrow"}</strong>
        ) : (
          <>
            <strong>{days}</strong> days away
          </>
        )}
      </p>
    </section>
  );
}

function YearOverviewHero({
  year,
  count,
  variant,
}: {
  year: number;
  count: number;
  variant: "exhausted" | "past" | "future";
}) {
  const line =
    variant === "exhausted"
      ? `That is every bank holiday for ${year}.`
      : variant === "past"
        ? `${year} is done.`
        : `Scheduled for ${year}.`;

  return (
    <section
      className="bk-hero bk-hero-quiet"
      aria-label={`Bank holidays ${year}`}
    >
      <span className="bk-hero-tag">{year}</span>
      <h3 className="bk-hero-name">
        {count} bank holiday{count === 1 ? "" : "s"}
      </h3>
      <p className="bk-hero-count">{line}</p>
    </section>
  );
}

function HolidaySection({
  heading,
  chip,
  holidays,
  block,
  substituteFor,
  highlightFirst,
  muted,
}: {
  heading: string;
  chip: string;
  holidays: Holiday[];
  block: CalendarBlock;
  substituteFor: Map<string, Holiday>;
  highlightFirst?: boolean;
  muted?: boolean;
}) {
  if (holidays.length === 0) return null;

  const showDay = has(block, "day");
  const label = (field: string) =>
    block.columns.find((column) => column.field === field)?.label ?? "";

  return (
    <section className="bk-section">
      <div className="bk-section-head">
        <h3 className="bk-section-title">{heading}</h3>
        <span className="bk-chip">{chip}</span>
      </div>

      <div className={showDay ? "bk-rows" : "bk-rows bk-rows-no-day"}>
        <div className="bk-rows-head" aria-hidden="true">
          <span>{label("date") || "Date"}</span>
          <span>{label("name") || "Holiday"}</span>
          {showDay ? <span>{label("day") || "Day"}</span> : null}
        </div>
        <ul className="bk-row-list">
          {holidays.map((holiday, index) => (
            <HolidayRow
              key={`${holiday.name}-${index}`}
              holiday={holiday}
              block={block}
              isNext={Boolean(highlightFirst && index === 0)}
              muted={muted}
              substitute={substituteFor.get(holiday.name)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function HolidayRow({
  holiday,
  block,
  isNext,
  muted,
  substitute,
}: {
  holiday: Holiday;
  block: CalendarBlock;
  isNext?: boolean;
  muted?: boolean;
  substitute?: Holiday;
}) {
  const showDay = has(block, "day");
  const showNote = has(block, "note");

  return (
    <li
      className={[
        "bk-row",
        isNext ? "bk-row-next" : "",
        muted ? "bk-row-muted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="bk-tile" aria-hidden="true">
        <span className="bk-tile-month">{fmtMonthShort(holiday.date)}</span>
        <span className="bk-tile-day">{fmtDayNum(holiday.date)}</span>
      </div>

      <div className="bk-row-main">
        {/*
          The tile is decorative, so without this the full date is never
          announced — the live page loses it entirely. This puts it back for
          a screen reader without changing what anyone sees.
        */}
        <span className="bk-sr-only">{fmtFullDate(holiday.date)}</span>
        <span className="bk-row-name">{holiday.name}</span>
        {showNote && holiday.note ? (
          <span className="bk-row-note">{holiday.note}</span>
        ) : null}
        {substitute ? (
          <span className="bk-observed">
            Observed: {fmtSubstituteDate(substitute.date)}
          </span>
        ) : null}
      </div>

      {showDay ? (
        <div className="bk-row-day">{fmtDayOfWeek(holiday.date)}</div>
      ) : null}
    </li>
  );
}

function SubstitutionNotice({
  year,
  substituteCount,
}: {
  year: number;
  substituteCount: number;
}) {
  const summary =
    substituteCount === 0
      ? `No substitute days apply for ${year}.`
      : `${substituteCount} substitute day${substituteCount > 1 ? "s" : ""} ` +
        `appl${substituteCount === 1 ? "ies" : "y"} for ${year}.`;

  return (
    <div className="bk-notice">
      <strong className="bk-notice-title">
        When a bank holiday falls on a weekend
      </strong>
      Most holidays falling on a Sunday are observed on the following Monday.{" "}
      {summary}
      {/* Open by default, as the live page has it: the rules are the
          reason the notice exists. */}
      <details className="bk-notice-details" open>
        <summary>Read the full rules</summary>
        <p>
          If New Year&apos;s Day, Errol Barrow Day, National Heroes Day, Labour
          Day, Independence Day or Boxing Day falls on a Sunday, the following
          Monday is observed as a public holiday in lieu.
        </p>
        <p>
          If Emancipation Day (1 August) falls on a Sunday or Monday, the
          following Tuesday is also a public holiday. The same applies to
          Christmas Day.
        </p>
      </details>
    </div>
  );
}
