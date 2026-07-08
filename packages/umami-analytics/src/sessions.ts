// Session-based aggregation for the consolidated analytics dashboard.
//
// The original report (metrics.ts) counts raw Umami *events* (`/metrics`,
// `/event-data`), which inflates funnels: one visitor who reloads or steps back
// re-fires events. This module instead reconstructs each Umami **session** from
// its ordered activity and counts **distinct sessions** — the honest unit.
//
// It powers, in one place:
//  - distinct-session form funnels (#1914)
//  - reached-vs-completed per step, from `form-step-view` vs `form-step-*` (#1915)
//  - `form-submit-error` as a first-class per-form metric (#1916)
//  - cross-journey flow / entry / exit / devices / countries (folding in the
//    standalone "journeys" dashboard)
//
// Ported from govtech-bb/govbb-umami-analytics (journeys.mjs), typed and
// session-deduped. Fetching lives in the snapshot generator; everything here is
// a pure function over already-fetched data so it is unit-testable without creds.

/** One row of Umami `/websites/:id/sessions/:id/activity`. */
export interface ActivityRow {
  createdAt: string;
  urlPath?: string;
  urlQuery?: string;
  /** present on custom-event rows; absent/empty on pageview rows. */
  eventName?: string;
}

/** Session-level metadata from `/websites/:id/sessions`. */
export interface RawSession {
  id: string;
  country?: string | null;
  device?: string | null;
  views?: number;
}

/** A session paired with its ordered activity. */
export interface SessionWithActivity {
  session: RawSession;
  activity: ActivityRow[];
}

interface JourneyEvent {
  /** full event name, e.g. `youth-opportunity-byac:form-step-view`. */
  name: string;
  /** step slug from the `?step=` query param, repeatable index stripped. */
  step: string | null;
}

export interface Journey {
  id: string;
  /** ordered, de-duplicated page path labels (navigation only). */
  pages: string[];
  events: JourneyEvent[];
  country: string | null;
  device: string | null;
  bounce: boolean;
}

function cleanPath(path?: string): string {
  if (!path) return "/";
  const p = path.split("?")[0]!.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

function stepFromQuery(query?: string): string | null {
  if (!query) return null;
  const m = query.match(/(?:^|&)step=([^&]*)/);
  if (!m) return null;
  let raw = m[1]!;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  // Repeatable sections add a trailing index (child-0, child-1) — collapse to
  // one logical step so "add another" isn't read as a drop-off.
  return raw.replace(/-\d+$/, "");
}

/**
 * Reconstruct each session's ordered page journey + custom events. Custom
 * events are kept separately (folded out of the page flow so the Sankey stays
 * about navigation). Immediate page repeats (reloads) are collapsed.
 */
export function buildJourneys(sessions: SessionWithActivity[]): Journey[] {
  const journeys: Journey[] = [];
  for (const { session, activity } of sessions) {
    const rows = [...activity].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
    const pages: string[] = [];
    const events: JourneyEvent[] = [];
    for (const r of rows) {
      if (r.eventName) {
        events.push({ name: r.eventName, step: stepFromQuery(r.urlQuery) });
        continue;
      }
      const label = cleanPath(r.urlPath);
      if (pages[pages.length - 1] !== label) pages.push(label);
    }
    if (!pages.length && !events.length) continue;
    journeys.push({
      id: session.id,
      pages,
      events,
      country: session.country ?? null,
      device: session.device ?? null,
      bounce: pages.length === 1,
    });
  }
  return journeys;
}

// --- funnels -------------------------------------------------------------

export interface FunnelStep {
  slug: string;
  label: string;
  /** distinct sessions that *reached* the step (`form-step-view`). */
  reached: number;
  /** distinct sessions that *completed* the step (`form-step-*` advance). */
  completed: number;
  /** reached - completed: sessions that reached but abandoned mid-step (#1915). */
  abandonedInStep: number;
}

export interface FormFunnel {
  form: string;
  /** distinct sessions that started the form. */
  started: number;
  /** distinct sessions that submitted successfully. */
  submitted: number;
  /** distinct sessions that reached the review step. */
  reachedReview: number;
  /** submitted / started (0–1); 0 when no starts. */
  completion: number;
  steps: FunnelStep[];
  friction: {
    wentBack: number;
    editedAnswers: number;
    /** distinct sessions that hit a submit error — first-class now (#1916). */
    submitErrors: number;
    validationErrors: number;
  };
  /** submitErrors / (submitted + submitErrors) (0–1); 0 when no submit attempts. */
  submitErrorRate: number;
}

function humanise(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

interface FormAgg {
  start: Set<string>;
  review: Set<string>;
  submit: Set<string>;
  submitError: Set<string>;
  validationError: Set<string>;
  back: Set<string>;
  edit: Set<string>;
  reached: Map<string, Set<string>>; // slug -> sessions (form-step-view)
  completed: Map<string, Set<string>>; // slug -> sessions (form-step-*)
  rankSum: Map<string, number>;
  rankN: Map<string, number>;
}

function emptyAgg(): FormAgg {
  return {
    start: new Set(),
    review: new Set(),
    submit: new Set(),
    submitError: new Set(),
    validationError: new Set(),
    back: new Set(),
    edit: new Set(),
    reached: new Map(),
    completed: new Map(),
    rankSum: new Map(),
    rankN: new Map(),
  };
}

function addToSlug(map: Map<string, Set<string>>, slug: string, id: string) {
  if (!map.has(slug)) map.set(slug, new Set());
  map.get(slug)!.add(id);
}

/**
 * Build per-form, distinct-session funnels. Steps are ordered by mean positional
 * rank across sessions (robust to conditional/optional steps). Each step tracks
 * both reached (`form-step-view`) and completed (`form-step-*` advance).
 */
export function buildFunnels(journeys: Journey[]): FormFunnel[] {
  const byForm = new Map<string, FormAgg>();
  const ensure = (form: string) => {
    let f = byForm.get(form);
    if (!f) byForm.set(form, (f = emptyAgg()));
    return f;
  };

  for (const j of journeys) {
    const completedOrder: Array<[string, string]> = []; // [form, slug] in time order
    for (const e of j.events) {
      const idx = e.name.indexOf(":");
      if (idx === -1) continue;
      const form = e.name.slice(0, idx);
      const ev = e.name.slice(idx + 1);
      const f = ensure(form);
      if (ev === "form-start") f.start.add(j.id);
      else if (ev === "form-review") f.review.add(j.id);
      else if (ev === "form-submit") f.submit.add(j.id);
      else if (ev === "form-submit-error") f.submitError.add(j.id);
      else if (ev === "form-validation-error") f.validationError.add(j.id);
      else if (ev === "form-step-back") f.back.add(j.id);
      else if (ev === "form-step-edit") f.edit.add(j.id);
      else if (ev === "form-step-view" && e.step) {
        addToSlug(f.reached, e.step, j.id);
      } else if (/^form-step-/.test(ev) && e.step) {
        // a genuine step advance (form-step-one, -two, …) carrying a slug
        addToSlug(f.completed, e.step, j.id);
        completedOrder.push([form, e.step]);
      }
    }
    // positional rank of each completed slug within this session's order
    const perForm = new Map<string, string[]>();
    for (const [form, slug] of completedOrder) {
      if (!perForm.has(form)) perForm.set(form, []);
      perForm.get(form)!.push(slug);
    }
    for (const [form, slugs] of perForm) {
      const f = byForm.get(form)!;
      slugs.forEach((slug, i) => {
        f.rankSum.set(slug, (f.rankSum.get(slug) ?? 0) + i);
        f.rankN.set(slug, (f.rankN.get(slug) ?? 0) + 1);
      });
    }
  }

  const funnels: FormFunnel[] = [];
  for (const [form, f] of byForm) {
    // union of every slug seen as reached or completed
    const slugs = new Set<string>([...f.reached.keys(), ...f.completed.keys()]);
    const ordered = [...slugs].sort((a, b) => {
      const ra = f.rankN.get(a)
        ? f.rankSum.get(a)! / f.rankN.get(a)!
        : Infinity;
      const rb = f.rankN.get(b)
        ? f.rankSum.get(b)! / f.rankN.get(b)!
        : Infinity;
      return ra - rb;
    });
    const steps: FunnelStep[] = ordered.map((slug) => {
      const reached = f.reached.get(slug)?.size ?? 0;
      const completed = f.completed.get(slug)?.size ?? 0;
      return {
        slug,
        label: humanise(slug),
        reached,
        completed,
        abandonedInStep: Math.max(0, reached - completed),
      };
    });
    const started = f.start.size;
    const submitted = f.submit.size;
    const submitErrors = f.submitError.size;
    funnels.push({
      form,
      started,
      submitted,
      reachedReview: f.review.size,
      completion: started ? submitted / started : 0,
      steps,
      friction: {
        wentBack: f.back.size,
        editedAnswers: f.edit.size,
        submitErrors,
        validationErrors: f.validationError.size,
      },
      submitErrorRate:
        submitted + submitErrors
          ? submitErrors / (submitted + submitErrors)
          : 0,
    });
  }
  return funnels
    .filter((f) => f.started > 0 || f.submitted > 0)
    .sort((a, b) => b.started - a.started);
}

// --- journeys / flow / mix ----------------------------------------------

export interface CountRow {
  key: string;
  count: number;
}
export interface JourneySequence {
  steps: string[];
  count: number;
  pct: number;
}
export interface FlowLink {
  from: string;
  to: string;
  depth: number;
  count: number;
}

export interface SessionReport {
  window: { startAt: number; endAt: number; days: number };
  totals: {
    sessions: number;
    pageviews: number;
    bounces: number;
    bounceRate: number;
    avgSteps: number;
  };
  entries: CountRow[];
  exits: CountRow[];
  topJourneys: JourneySequence[];
  flow: FlowLink[];
  funnels: FormFunnel[];
  devices: CountRow[];
  countries: CountRow[];
}

function tally(
  journeys: Journey[],
  keyFn: (j: Journey) => string | null,
): CountRow[] {
  const m = new Map<string, number>();
  for (const j of journeys) {
    const k = keyFn(j);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/** Aggregate reconstructed journeys into the consolidated session report. */
export function aggregateSessions(
  journeys: Journey[],
  window: { startAt: number; endAt: number },
  opts: { depth?: number; topN?: number } = {},
): SessionReport {
  const depth = opts.depth ?? 4;
  const topN = opts.topN ?? 12;
  const total = journeys.length;
  const pageviews = journeys.reduce((s, j) => s + j.pages.length, 0);
  const bounces = journeys.filter((j) => j.bounce).length;

  const flow: FlowLink[] = [];
  const linksByDepth: Array<Map<string, number>> = Array.from(
    { length: depth },
    () => new Map(),
  );
  for (const j of journeys) {
    for (let d = 0; d < depth && d + 1 < j.pages.length; d++) {
      const k = `${j.pages[d]}\t${j.pages[d + 1]}`;
      linksByDepth[d]!.set(k, (linksByDepth[d]!.get(k) ?? 0) + 1);
    }
  }
  linksByDepth.forEach((m, d) => {
    for (const [k, count] of m) {
      const [from, to] = k.split("\t");
      flow.push({ from: from!, to: to!, depth: d, count });
    }
  });
  flow.sort((a, b) => a.depth - b.depth || b.count - a.count);

  const seqs = tally(journeys, (j) => j.pages.join(" › "));

  return {
    window: {
      startAt: window.startAt,
      endAt: window.endAt,
      days: Math.round((window.endAt - window.startAt) / 86_400_000),
    },
    totals: {
      sessions: total,
      pageviews,
      bounces,
      bounceRate: total ? bounces / total : 0,
      avgSteps: total ? pageviews / total : 0,
    },
    entries: tally(journeys, (j) => j.pages[0] ?? null).slice(0, topN),
    exits: tally(journeys, (j) => j.pages[j.pages.length - 1] ?? null).slice(
      0,
      topN,
    ),
    topJourneys: seqs.slice(0, 25).map(({ key, count }) => ({
      steps: key.split(" › "),
      count,
      pct: total ? count / total : 0,
    })),
    flow,
    funnels: buildFunnels(journeys),
    devices: tally(journeys, (j) => j.device).slice(0, 6),
    countries: tally(journeys, (j) => j.country).slice(0, 8),
  };
}
