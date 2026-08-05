import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import { firstValueFrom } from "rxjs";
import {
  classifyType,
  clip,
  matchParishes,
  type Outage,
  parseEventWindow,
  stripHtml,
} from "./outages.domain";

const DEFAULT_FEED_URL =
  "https://barbadoswaterauthority.com/category/service-disruptions/feed/";

// Serve a parsed feed from memory for at most this long before re-fetching, so
// a burst of page loads doesn't hammer the BWA site. On the honesty principle
// we never serve a stale copy once it expires — a failed refresh throws.
const FEED_TTL_MS = 10 * 60 * 1000;

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  "content:encoded"?: string;
  guid?: string | { "#text"?: string };
}

/**
 * Reads the Barbados Water Authority "Service Disruptions" RSS feed, parses it,
 * and tags each notice with parishes, type, and dates. Shared by the public
 * outages endpoint (the map/list) and the alert checker (Step 4). Throws when
 * the feed is unreachable so callers can surface an honest "can't reach BWA"
 * state rather than fake or stale data.
 *
 * Ported from the prototype's src/lib/bwa.ts; the Next.js `revalidate` cache is
 * replaced with a small in-process TTL cache.
 */
@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);
  private readonly parser = new XMLParser({ ignoreAttributes: false });
  private cache: { expires: number; outages: Outage[] } | null = null;

  constructor(private readonly http: HttpService) {}

  private get feedUrl(): string {
    return process.env.BWA_FEED_URL ?? DEFAULT_FEED_URL;
  }

  /** Parsed BWA notices, freshest first-parsed order. Throws on feed failure. */
  async fetchOutages(): Promise<Outage[]> {
    if (this.cache && this.cache.expires > Date.now())
      return this.cache.outages;

    const response = await firstValueFrom(
      this.http.get<string>(this.feedUrl, {
        responseType: "text",
        headers: {
          "User-Agent": "gov.bb-water-alerts/1.0 (https://gov.bb)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      }),
    );

    const outages = this.parse(response.data);
    this.cache = { expires: Date.now() + FEED_TTL_MS, outages };
    return outages;
  }

  private parse(xml: string): Outage[] {
    const parsed = this.parser.parse(xml);
    const rawItems = parsed?.rss?.channel?.item;
    const items: RssItem[] = Array.isArray(rawItems)
      ? rawItems
      : rawItems
        ? [rawItems]
        : [];
    return items.map((item, index) => this.toOutage(item, index));
  }

  private toOutage(item: RssItem, index: number): Outage {
    const title =
      typeof item.title === "string" ? item.title : "Water service notice";
    const body = stripHtml(
      `${item.description ?? ""} ${item["content:encoded"] ?? ""}`,
    );
    const haystack = `${title} ${body}`;
    const published = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString();
    const guid =
      typeof item.guid === "object" ? item.guid?.["#text"] : item.guid;
    const { eventDay, endsAt } = parseEventWindow(haystack, published);

    return {
      id: guid || item.link || `bwa-${index}`,
      title: stripHtml(title),
      link: item.link ?? this.feedUrl,
      published,
      summary: clip(body, 280),
      parishes: matchParishes(haystack),
      type: classifyType(haystack),
      eventDay,
      endsAt,
    };
  }
}
