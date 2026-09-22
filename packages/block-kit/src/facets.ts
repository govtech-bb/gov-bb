/**
 * Turning a facet definition into a predicate over collection records.
 *
 * This file is the sharp edge of "parameters are data, formulas are code".
 * A facet's key, label, type, options and ordering are editable JSONB. How
 * it actually matches a record is code, shipped by a developer, and looked
 * up by key in `COMPUTED_FACETS` below.
 *
 * Only facets absent from that registry fall through to generic matching
 * (`row[key]` is one of the selected values). On the real pharmacy finder
 * that is *none of them* — see the findings write-up. That is a result, not
 * a shortcoming of this implementation: the production finder's filters are
 * predicates over several fields, not field/value equality.
 */

import type { Facet } from "./types";

export type RecordRow = Record<string, unknown>;

/** What the user has selected for one facet. */
export type FacetSelection = string[];

export type FacetPredicate = (
  row: RecordRow,
  selected: FacetSelection,
  now: Date | null,
) => boolean;

const str = (value: unknown): string => (value == null ? "" : String(value));

/* ------------------------------------------------------ opening hours */

export interface TimeRange {
  opens: string;
  closes: string;
}
export type WeeklyHours = Record<string, TimeRange[]>;

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** UTC-4 year-round — Barbados has no daylight saving time. */
export const BARBADOS_TIME_ZONE = "America/Barbados";

const WALL_CLOCK_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: BARBADOS_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 'HH:MM' → minutes since midnight. */
export function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function barbadosWallClock(now: Date): {
  weekday: string;
  minutes: number;
} {
  const parts = new Map(
    WALL_CLOCK_FORMAT.formatToParts(now).map((p) => [p.type, p.value]),
  );
  return {
    weekday: (parts.get("weekday") ?? "").toLowerCase(),
    minutes: Number(parts.get("hour")) * 60 + Number(parts.get("minute")),
  };
}

/**
 * Whether a record with a `hours` WeeklyHours field is open at `now`.
 *
 * A deliberate subset of apps/landing's `pharmacyStatus`: it ignores the
 * `bankHolidayHours` override and the "next opening" lookahead, because the
 * spike is testing whether a facet can be *configured*, not re-shipping the
 * production finder. Noted in the README so nobody mistakes it for parity.
 */
export function isOpenAt(row: RecordRow, now: Date): boolean {
  const hours = row.hours as WeeklyHours | undefined;
  if (!hours) return false;
  const at = barbadosWallClock(now);
  const ranges = hours[at.weekday] ?? [];
  return ranges.some(
    (range) =>
      at.minutes >= toMinutes(range.opens) &&
      at.minutes < toMinutes(range.closes),
  );
}

/* ------------------------------------------- the computed facet registry */

/**
 * `white` (Drug Service) → participating private pharmacies only.
 * `yellow`/`green` (GEHP) → government pharmacies only.
 */
function acceptsSlip(row: RecordRow, slip: string): boolean {
  if (str(row.type) === "government") return slip !== "white";
  return (
    str(row.type) === "private" &&
    str(row.pppStatus) === "participating" &&
    slip === "white"
  );
}

export const COMPUTED_FACETS: Record<string, FacetPredicate> = {
  openNow: (row, selected, now) =>
    selected.length === 0 ? true : now !== null && isOpenAt(row, now),

  /**
   * Not a field: a private pharmacy only counts as subsidised when it is
   * participating in the Drug Service. Government facilities always pass.
   */
  subsidisedOnly: (row, selected) =>
    selected.length === 0
      ? true
      : str(row.type) !== "private" || str(row.pppStatus) === "participating",

  /**
   * `private-sbs` is a predicate over two fields, not a stored value of
   * `type`. Generic field matching cannot express it.
   */
  type: (row, selected) => {
    if (selected.length === 0 || selected.includes("all")) return true;
    return selected.some((value) => {
      if (value === "government") return str(row.type) === "government";
      if (value === "private-sbs") {
        return (
          str(row.type) === "private" && str(row.pppStatus) === "participating"
        );
      }
      return str(row.type) === value;
    });
  },

  /** Slip acceptance is derived from type + pppStatus; no field holds it. */
  slip: (row, selected) => {
    const choice = selected.find((value) => value !== "any");
    return choice === undefined ? true : acceptsSlip(row, choice);
  },

  /** The island-wide delivery service serves every parish. */
  parish: (row, selected) =>
    selected.length === 0 ||
    str(row.parish) === "All parishes" ||
    selected.includes(str(row.parish)),
};

/** Generic fallback: the record's field value is one of the selected ones. */
function genericMatch(facet: Facet): FacetPredicate {
  return (row, selected) =>
    selected.length === 0 || selected.includes(str(row[facet.key]));
}

export function predicateFor(facet: Facet): FacetPredicate {
  return COMPUTED_FACETS[facet.key] ?? genericMatch(facet);
}

/** True when every facet with a selection matches the row. */
export function matchesFacets(
  row: RecordRow,
  facets: Facet[],
  selections: Record<string, FacetSelection>,
  now: Date | null,
): boolean {
  return facets.every((facet) =>
    predicateFor(facet)(row, selections[facet.key] ?? [], now),
  );
}

export function matchesSearch(
  row: RecordRow,
  query: string,
  fields: string[],
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => str(row[field]).toLowerCase().includes(needle));
}
