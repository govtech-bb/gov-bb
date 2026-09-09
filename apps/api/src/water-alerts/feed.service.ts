import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import { firstValueFrom } from "rxjs";
import { z } from "zod";
import {
  classifyType,
  clip,
  decodeEntities,
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
const MAX_FEED_BYTES = 2 * 1024 * 1024;

const rssItemSchema = z.object({
  title: z.string().trim().min(1),
  link: z.string().trim().min(1),
  pubDate: z.string().min(1),
  description: z.string().optional(),
  "content:encoded": z.string().optional(),
  guid: z.string().trim().max(512).optional(),
});
const rssSchema = z.object({
  rss: z.object({
    channel: z.object({
      item: z.union([rssItemSchema, z.array(rssItemSchema)]).optional(),
    }),
  }),
});

export interface OutagesFeed {
  outages: Outage[];
  /** ISO instant this feed was fetched, including when served from cache. */
  checkedAt: string;
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
  private readonly parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    processEntities: false,
  });
  private cache: { expires: number; feed: OutagesFeed } | null = null;

  constructor(private readonly http: HttpService) {}

  private get feedUrl(): string {
    return process.env.BWA_FEED_URL ?? DEFAULT_FEED_URL;
  }

  /** Parsed BWA notices, freshest first-parsed order. Throws on feed failure. */
  async fetchOutages(): Promise<OutagesFeed> {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.feed;

    const response = await firstValueFrom(
      this.http.get<string>(this.feedUrl, {
        responseType: "text",
        timeout: 10_000,
        maxContentLength: MAX_FEED_BYTES,
        headers: {
          "User-Agent": "gov.bb-water-alerts/1.0 (https://gov.bb)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      }),
    );

    const feed = {
      outages: this.parse(response.data),
      checkedAt: new Date().toISOString(),
    };
    this.cache = { expires: Date.now() + FEED_TTL_MS, feed };
    return feed;
  }

  private parse(xml: string): Outage[] {
    if (typeof xml !== "string" || /<!DOCTYPE/i.test(xml)) {
      throw new Error("Invalid BWA RSS feed");
    }
    const parsed = rssSchema.parse(this.parser.parse(xml, true));
    const rawItems = parsed.rss.channel.item;
    const items = Array.isArray(rawItems)
      ? rawItems
      : rawItems
        ? [rawItems]
        : [];
    return items.map((item) => this.toOutage(item));
  }

  private toOutage(item: z.infer<typeof rssItemSchema>): Outage {
    const title = stripHtml(item.title);
    const link = new URL(decodeEntities(item.link));
    if (!["https:", "http:"].includes(link.protocol)) {
      throw new Error("Invalid BWA notice link");
    }
    const body = stripHtml(
      `${item.description ?? ""} ${item["content:encoded"] ?? ""}`,
    );
    const haystack = `${title} ${body}`;
    const published = new Date(item.pubDate).toISOString();
    const id = item.guid || link.href;
    if (id.length > 512) throw new Error("Invalid BWA notice identifier");
    const { eventDay, endsAt } = parseEventWindow(haystack, published);

    return {
      id,
      title,
      link: link.href,
      published,
      summary: clip(body, 280),
      parishes: matchParishes(haystack),
      type: classifyType(haystack),
      eventDay,
      endsAt,
    };
  }
}
