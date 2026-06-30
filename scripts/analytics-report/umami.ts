// Thin Umami Cloud REST client. I/O only — aggregation lives in metrics.ts.
import type { EventDataValue, ExpandedRow, MetricRow } from "./types";

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
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + MIN_REQUEST_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    await this.throttle();
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: { "x-umami-api-key": this.apiKey, accept: "application/json" },
    });
    if (!res.ok) {
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

  /** Event-name counts (forms site). Aligned events are `<form_id>:<event>`. */
  metricsEvents(websiteId: string, range: Range): Promise<MetricRow[]> {
    return this.get<MetricRow[]>(`/websites/${websiteId}/metrics`, {
      type: "event",
      ...range,
      limit: 500,
    });
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
}
