// When things happened, in Barbados time wherever the author is, as the site dates them: a page saved at 10pm on
// 7 October was saved on the 7th, not on the UTC 8th. A calendar day with no time, such as a page's publish_date, is
// held as UTC midnight, so it's read in UTC to keep its day.

const barbados = "America/Barbados";

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: barbados });

const dayAndTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: barbados,
});

const calendarDay = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

// en-CA writes a day as 2026-10-07
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: barbados });

/** An ISO timestamp's day in Barbados, such as 7 Oct 2026. */
export const formatDay = (timestamp: string) => day.format(new Date(timestamp));

/** An ISO timestamp's day and time in Barbados, such as 7 Oct 2026, 22:30. */
export const formatDayAndTime = (timestamp: string) => dayAndTime.format(new Date(timestamp));

/** A calendar day, such as 2026-10-07, as 7 Oct 2026. */
export const formatCalendarDay = (date: string) => calendarDay.format(new Date(date));

/**
 * The calendar day a timestamp falls on in Barbados, such as 2026-10-07. UTC midnight is a day already, carried over
 * from a Markdown publish_date, and keeps it, as the site reads it (landing's api-v2-page.ts).
 */
export function barbadosDay(timestamp: string) {
  const instant = new Date(timestamp);

  return instant.getTime() % 86_400_000 === 0
    ? instant.toISOString().slice(0, 10)
    : isoDay.format(instant);
}
