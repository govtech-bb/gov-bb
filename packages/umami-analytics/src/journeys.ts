// The landing journey list, shared by the analytics dashboard and the Slack
// /stats command so both show the same journeys. Pure: the caller reads the
// journey report from Umami.
import { canonicalEvent } from "@govtech-bb/analytics";
import type { JourneyPath, SourceRow } from "./types";

function humanizeSlug(s: string): string {
  const spaced = s.replace(/[-_]/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : s;
}

/**
 * Turn a raw journey step (path or `<form>:<event>`) into a short label. The
 * generic "Start" (form-start event or a `/…/start` page) and "Form"
 * (`/…/form` page) steps are qualified with their root service — e.g.
 * "Get birth certificate · Start" — so they're not ambiguous in the flow. Pass
 * `qualifyGoal = false` (used by the journey breadcrumb list, where the
 * preceding step already gives the context) to get the bare "Start"/"Form".
 */
export function humanizeStep(raw: string, qualifyGoal = true): string {
  if (!raw) return "";
  if (!raw.startsWith("/") && raw.includes(":")) {
    const form = raw.slice(0, raw.indexOf(":"));
    // Canonicalise so a long-id form's compact code (#2682, e.g. `fstrt`/`sview`)
    // resolves to its real event rather than rendering as "Fstrt".
    const event = canonicalEvent(raw.slice(raw.indexOf(":") + 1));
    if (event === "form-start")
      return qualifyGoal ? `${humanizeSlug(form)} · Start` : "Start";
    return humanizeSlug(event);
  }
  const path = raw.split("?")[0].replace(/\/+$/, "");
  const segs = path.split("/").filter(Boolean);
  if (!segs.length) return "Home";
  const last = segs[segs.length - 1];
  // A form's start/form page: qualify with the service segment above it.
  if ((last === "start" || last === "form") && segs.length >= 2) {
    const step = last === "start" ? "Start" : "Form";
    return qualifyGoal
      ? `${humanizeSlug(segs[segs.length - 2])} · ${step}`
      : step;
  }
  return humanizeSlug(last);
}

/** One row of the "most common journeys" table: an ordered step breadcrumb. */
export interface JourneyRow {
  items: string[];
  sessions: number;
  share: number;
  /** raw path of the entry step, for the referrer lookup. */
  entryPath: string;
  /** top referrers to the entry page (filled by fetchOverviewData). */
  topSources: SourceRow[];
}

/**
 * The top multi-step journeys as an ordered breadcrumb list (the table view of
 * the flow). Uses **page navigation only** — the `form-start` (and other) events
 * are dropped, so a form visit reads as its pages (service → Start → Form) and
 * the many event-ordering variants merge into one row instead of fragmenting.
 * Single-page visits (bounces) are excluded so the list is actual journeys, and
 * "Start"/"Form" are the `/…/start` and `/…/form` pages. Identical sequences
 * merge; share is of all listed (multi-step) journeys.
 */
export function shapeJourneyList(
  journeys: JourneyPath[],
  depth = 4,
  topN = 12,
): JourneyRow[] {
  const merged = new Map<
    string,
    { items: string[]; sessions: number; entryPath: string }
  >();
  for (const j of journeys) {
    const items: string[] = [];
    let entryPath = "";
    for (const it of j.items) {
      // page paths only — events (…:form-start, chat-*, search) are excluded.
      if (!it || !it.startsWith("/")) continue;
      // Qualify only the entry step, so a journey that begins on a `/…/start`
      // or `/…/form` page shows the service ("Get birth certificate · Start")
      // rather than a bare "Start"; later steps stay bare (context is implied).
      const first = items.length === 0;
      const label = humanizeStep(it, first);
      if (items[items.length - 1] === label) continue;
      if (first) entryPath = it.split("?")[0];
      items.push(label);
      if (items.length >= depth) break;
    }
    // A journey is a path — drop single-page visits (bounces).
    if (items.length < 2) continue;
    const key = items.join("␟");
    const existing = merged.get(key);
    if (existing) existing.sessions += j.count;
    else merged.set(key, { items, sessions: j.count, entryPath });
  }
  const all = [...merged.values()].sort((a, b) => b.sessions - a.sessions);
  const total = all.reduce((s, r) => s + r.sessions, 0);
  return all.slice(0, topN).map((r) => ({
    ...r,
    topSources: [],
    share: total ? r.sessions / total : 0,
  }));
}
