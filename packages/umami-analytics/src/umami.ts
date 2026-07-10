// Thin Umami Cloud REST client. I/O only — aggregation lives in metrics.ts
// (event-count report) and sessions.ts (session-based consolidated report).
import type {
  EventDataValue,
  ExpandedRow,
  MetricRow,
  FunnelStepInput,
  FunnelStepResult,
  JourneyPath,
} from "./types";
import type { ActivityRow, RawSession, SessionWithActivity } from "./sessions";

export interface UmamiClientOptions {
  apiKey: string;
  /** Defaults to the Umami Cloud API base. */
  baseUrl?: string;
}

export interface Range {
  startAt: number; // unix ms
  endAt: number; // unix ms
}

const DEFAULT_BASE_URL = "https://api.umami.is/v1";
// Cloud rate limit is 50 requests / 15s. Space requests ~330ms apart to stay
// comfortably under it without a sliding-window accountant.
const MIN_REQUEST_SPACING_MS = 330;

export class UmamiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private lastRequestAt = 0;

  constructor({ apiKey, baseUrl }: UmamiClientOptions) {
    this.apiKey = apiKey;
    // Trim trailing slashes with an index walk rather than `/\/+$/` — that
    // pattern is polynomial-ReDoS (js/polynomial-redos) on inputs with many
    // repeated trailing slashes.
    const base = baseUrl ?? DEFAULT_BASE_URL;
    let end = base.length;
    while (end > 0 && base[end - 1] === "/") end--;
    this.baseUrl = base.slice(0, end);
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + MIN_REQUEST_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number>,
    attempt = 0,
  ): Promise<T> {
    await this.throttle();
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const MAX_RETRIES = 3;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "x-umami-api-key": this.apiKey, accept: "application/json" },
      });
    } catch (err) {
      // Transient network error (ECONNRESET / fetch failed) — back off + retry
      // so a single dropped connection doesn't abort a long session crawl.
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return this.get<T>(path, params, attempt + 1);
      }
      throw err;
    }
    if (!res.ok) {
      // Retry rate-limit / server errors; fail fast on other 4xx.
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return this.get<T>(path, params, attempt + 1);
      }
      const body = await res.text().catch(() => "");
      throw new Error(
        `Umami ${res.status} ${res.statusText} for ${path} — ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  /** Top URLs with pageviews + visitors (landing site). */
  metricsUrls(websiteId: string, range: Range): Promise<ExpandedRow[]> {
    return this.get<ExpandedRow[]>(`/websites/${websiteId}/metrics/expanded`, {
      type: "url",
      ...range,
      limit: 500,
    });
  }

  /** Top referrers for a single page (`path` is Umami's URL filter param). */
  metricsReferrers(
    websiteId: string,
    pagePath: string,
    range: Range,
  ): Promise<MetricRow[]> {
    return this.get<MetricRow[]>(`/websites/${websiteId}/metrics`, {
      type: "referrer",
      path: pagePath,
      ...range,
      limit: 10,
    });
  }

  /** Event-name counts (forms site). Aligned events are `<form_id>:<event>`. */
  metricsEvents(websiteId: string, range: Range): Promise<MetricRow[]> {
    return this.get<MetricRow[]>(`/websites/${websiteId}/metrics`, {
      type: "event",
      ...range,
      limit: 500,
    });
  }

  /** Summarised site stats (pageviews, visitors, visits, …) — for diagnostics. */
  stats(websiteId: string, range: Range): Promise<unknown> {
    return this.get<unknown>(`/websites/${websiteId}/stats`, { ...range });
  }

  /** Distinct values + counts for one event's numeric/string property. */
  eventDataValues(
    websiteId: string,
    event: string,
    propertyName: string,
    range: Range,
  ): Promise<EventDataValue[]> {
    return this.get<EventDataValue[]>(
      `/websites/${websiteId}/event-data/values`,
      { event, propertyName, ...range },
    );
  }

  private async post<T>(path: string, body: unknown, attempt = 0): Promise<T> {
    await this.throttle();
    const url = new URL(`${this.baseUrl}${path}`);
    const MAX_RETRIES = 3;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "x-umami-api-key": this.apiKey,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return this.post<T>(path, body, attempt + 1);
      }
      throw err;
    }
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return this.post<T>(path, body, attempt + 1);
      }
      const text = await res.text().catch(() => "");
      throw new Error(
        `Umami ${res.status} ${res.statusText} for ${path} — ${text.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  /** Distinct-visitor funnel for a list of ordered steps (event names or paths). */
  reportFunnel(
    websiteId: string,
    opts: { steps: FunnelStepInput[]; window: number; range: Range },
  ): Promise<FunnelStepResult[]> {
    return this.post<FunnelStepResult[]>(`/reports/funnel`, {
      websiteId,
      type: "funnel",
      parameters: {
        startDate: new Date(opts.range.startAt).toISOString(),
        endDate: new Date(opts.range.endAt).toISOString(),
        steps: opts.steps,
        window: opts.window,
      },
    });
  }

  /** Top navigation paths (journey report). */
  reportJourney(
    websiteId: string,
    opts: { steps: number; startStep?: string; endStep?: string; range: Range },
  ): Promise<JourneyPath[]> {
    return this.post<JourneyPath[]>(`/reports/journey`, {
      websiteId,
      type: "journey",
      parameters: {
        startDate: new Date(opts.range.startAt).toISOString(),
        endDate: new Date(opts.range.endAt).toISOString(),
        steps: opts.steps,
        ...(opts.startStep ? { startStep: opts.startStep } : {}),
        ...(opts.endStep ? { endStep: opts.endStep } : {}),
      },
    });
  }

  /** One page of sessions for the range (Umami paginates: `{ data, count }`). */
  private sessionsPage(
    websiteId: string,
    range: Range,
    page: number,
    pageSize: number,
  ): Promise<{ data: RawSession[]; count: number }> {
    return this.get<{ data: RawSession[]; count: number }>(
      `/websites/${websiteId}/sessions`,
      { ...range, page, pageSize },
    );
  }

  /** List up to `maxSessions` sessions for the range (paginated). Cheap
   * relative to activity; lets a caller drive a resumable per-session crawl. */
  async listSessions(
    websiteId: string,
    range: Range,
    maxSessions = 2000,
    pageSize = 100,
  ): Promise<RawSession[]> {
    const sessions: RawSession[] = [];
    for (let page = 1; sessions.length < maxSessions; page++) {
      const { data, count } = await this.sessionsPage(
        websiteId,
        range,
        page,
        pageSize,
      );
      sessions.push(...data);
      if (data.length < pageSize || sessions.length >= count) break;
    }
    return sessions.slice(0, maxSessions);
  }

  /** Ordered pageviews + custom events for one session. */
  sessionActivity(
    websiteId: string,
    sessionId: string,
    range: Range,
  ): Promise<ActivityRow[]> {
    return this.get<ActivityRow[]>(
      `/websites/${websiteId}/sessions/${sessionId}/activity`,
      { ...range },
    );
  }

  /**
   * Fetch up to `maxSessions` sessions for the range, each with its ordered
   * activity — the raw input for the session-based report (sessions.ts). This
   * is many requests (1 per session for activity); the client's throttle keeps
   * it under Umami's rate limit. Callers should cache the result and commit a
   * snapshot rather than run this at serve time.
   */
  async collectSessions(
    websiteId: string,
    range: Range,
    opts: { maxSessions?: number; pageSize?: number } = {},
  ): Promise<SessionWithActivity[]> {
    const maxSessions = opts.maxSessions ?? 2000;
    const pageSize = opts.pageSize ?? 100;
    const sessions: RawSession[] = [];
    for (let page = 1; sessions.length < maxSessions; page++) {
      const { data, count } = await this.sessionsPage(
        websiteId,
        range,
        page,
        pageSize,
      );
      sessions.push(...data);
      if (data.length < pageSize || sessions.length >= count) break;
    }
    const capped = sessions.slice(0, maxSessions);
    const out: SessionWithActivity[] = [];
    for (const session of capped) {
      try {
        const activity = await this.sessionActivity(
          websiteId,
          session.id,
          range,
        );
        out.push({ session, activity });
      } catch {
        // Skip a session whose activity can't be fetched — one bad fetch must
        // not abort the whole crawl (the generator's resumable cache is the
        // preferred path; this keeps the convenience method robust too).
      }
    }
    return out;
  }
}
