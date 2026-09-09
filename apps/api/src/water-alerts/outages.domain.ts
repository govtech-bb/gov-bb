/**
 * Water-outage domain logic: the Outage type, parish matching, notice
 * classification, and the date/freshness rules. Pure — no Nest or Node-only
 * imports — so it is safe to unit-test in isolation and (later) share.
 *
 * Ported from the standalone "Wuh Water Doing?" prototype (src/lib/outages.ts).
 * Live notices come from the Barbados Water Authority RSS feed, parsed in
 * feed.service.ts.
 */
import { PARISHES } from "./parishes";

export type OutageType = "emergency" | "planned" | "repair" | "notice";

export interface Outage {
  id: string;
  title: string;
  link: string;
  /** ISO date the notice was published. */
  published: string;
  /** Plain-text summary (HTML stripped). */
  summary: string;
  /** Parish slugs this notice affects (may be empty if none matched). */
  parishes: string[];
  type: OutageType;
  /** The Barbados day the work happens, "YYYY-MM-DD", parsed from the text. */
  eventDay?: string;
  /** ISO instant the work window ends (accurate to Barbados time), if known. */
  endsAt?: string;
}

export const OUTAGE_TYPE_LABEL: Record<OutageType, string> = {
  emergency: "Emergency",
  planned: "Planned work",
  repair: "Repair",
  notice: "Notice",
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function fromCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

/**
 * Decode HTML entities to real characters: numeric (e.g. `&#038;`, `&#x26;`)
 * and the common named ones. BWA's feed encodes "&" as `&#038;`, which would
 * otherwise show up verbatim in titles.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => fromCodePoint(parseInt(dec, 10)))
    .replace(
      /&([a-z]+);/gi,
      (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole,
    );
}

/** Strip HTML tags, decode entities, and collapse whitespace to plain text. */
export function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trim text to at most `max` characters on a word boundary, adding an ellipsis
 * when it was actually shortened — so previews never stop mid-word. Readers can
 * open the full BWA notice for the rest.
 */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).replace(
    /[\s.,;:!?—–-]+$/,
    "",
  );
  return `${trimmed}…`;
}

/** Guess the kind of notice from its wording. */
export function classifyType(text: string): OutageType {
  const t = text.toLowerCase();
  if (/(emergency|urgent|burst|main break|unexpected)/.test(t))
    return "emergency";
  if (/(repair|fix|restore|station)/.test(t)) return "repair";
  if (
    /(install|scheduled|planned|connection|upgrade|maintenance|meter)/.test(t)
  )
    return "planned";
  return "notice";
}

// Build matchable aliases for each parish: "St. Michael", "St Michael", "Saint Michael".
const PARISH_ALIASES: Array<{ value: string; patterns: RegExp[] }> =
  PARISHES.map((p) => {
    const core = p.label.replace(/^St\.\s*/, "").trim(); // e.g. "Michael", "Christ Church"
    const aliases = new Set<string>([p.label]);
    if (p.label.startsWith("St.")) {
      aliases.add(`St ${core}`);
      aliases.add(`Saint ${core}`);
    }
    aliases.add(core);
    const patterns = Array.from(aliases).map(
      (a) =>
        new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
    );
    return { value: p.value, patterns };
  });

/** Find which parishes a notice mentions. */
export function matchParishes(text: string): string[] {
  const found: string[] = [];
  for (const { value, patterns } of PARISH_ALIASES) {
    if (patterns.some((re) => re.test(text))) found.push(value);
  }
  return found;
}

// ─── When is the work? ──────────────────────────────────────────────────────
const BB_TZ = "America/Barbados";
const BB_UTC_OFFSET_HOURS = 4; // Barbados is UTC-4, no daylight saving.
const STALE_DAYS = 3;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** "YYYY-MM-DD" for a date, in Barbados local time. */
export function bbDayKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: BB_TZ });
}

/**
 * Pull the work day and end time out of notice text such as
 * "... on Tuesday, June 23rd between 9:00 a.m. and 7:00 p.m."
 * Returns a Barbados calendar day and, if found, the instant the window ends.
 */
export function parseEventWindow(
  text: string,
  publishedIso: string,
): { eventDay?: string; endsAt?: string } {
  const m = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i,
  );
  if (!m) return {};
  const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
  const day = parseInt(m[2], 10);
  if (month === undefined || !day) return {};

  const published = new Date(publishedIso);
  let year = m[3] ? parseInt(m[3], 10) : published.getUTCFullYear();

  // No explicit year and the date lands well before publication => next year.
  if (!m[3]) {
    const guess = Date.UTC(year, month, day);
    const pub = Date.UTC(
      published.getUTCFullYear(),
      published.getUTCMonth(),
      published.getUTCDate(),
    );
    if (guess - pub < -45 * 86_400_000) year += 1;
  }

  // Anchor at noon AST so the calendar day is stable in any timezone.
  const eventDay = bbDayKey(
    new Date(Date.UTC(year, month, day, 12 + BB_UTC_OFFSET_HOURS, 0)),
  );

  // End time: take the LAST time mentioned (the end of the window).
  let endsAt: string | undefined;
  const times = [
    ...text.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/gi),
  ];
  if (times.length) {
    const t = times[times.length - 1];
    let hr = parseInt(t[1], 10);
    const min = t[2] ? parseInt(t[2], 10) : 0;
    const pm = /p/i.test(t[3]);
    if (pm && hr < 12) hr += 12;
    if (!pm && hr === 12) hr = 0;
    endsAt = new Date(
      Date.UTC(year, month, day, hr + BB_UTC_OFFSET_HOURS, min),
    ).toISOString();
  }

  return { eventDay, endsAt };
}

/** Has this work already finished? */
export function isPast(o: Outage, nowMs: number): boolean {
  if (o.endsAt) return nowMs > Date.parse(o.endsAt);
  if (o.eventDay) return o.eventDay < bbDayKey(new Date(nowMs));
  return nowMs - Date.parse(o.published) > STALE_DAYS * 86_400_000;
}

/** Is this something to act on now: today or coming up, and not over? */
export function isCurrentConcern(o: Outage, nowMs: number): boolean {
  if (isPast(o, nowMs)) return false;
  if (o.eventDay) return o.eventDay >= bbDayKey(new Date(nowMs));
  return true; // recent notice with no parsed day
}

/** Short human label: "Today", "Tomorrow", "Ended", or "23 Jun". */
export function freshnessLabel(o: Outage, nowMs: number): string {
  if (isPast(o, nowMs)) return "Ended";
  const key = o.eventDay ?? bbDayKey(new Date(o.published));
  if (key === bbDayKey(new Date(nowMs))) return "Today";
  if (key === bbDayKey(new Date(nowMs + 86_400_000))) return "Tomorrow";
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
