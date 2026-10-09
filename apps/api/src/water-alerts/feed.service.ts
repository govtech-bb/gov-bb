import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
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
// BWA's WordPress feed serves 10 notices. The cap bounds the per-notice work a
// hostile feed could force on the shared API (thousands of tiny bad items).
// Accepted edge: 100 invalid notices before any valid one cut the valid ones
// off and the feed 503s — no worse than a broken feed.
const MAX_FEED_ITEMS = 100;

const rssItemSchema = z.object({
  // BWA has published untitled notices (#2969); toOutage gives them a title.
  title: z.string().optional(),
  link: z.string().trim().min(1),
  pubDate: z.string().min(1),
  description: z.string().optional(),
  "content:encoded": z.string().optional(),
  guid: z.string().trim().max(512).optional(),
});
// Only the feed's structure is checked here. Items are validated one at a time
// in parse(), so a single bad notice can't fail every other notice (#2969).
const rssSchema = z.object({
  rss: z.object({
    channel: z.object({
      item: z.unknown().optional(),
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
  private readonly logger = new Logger(FeedService.name);
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
    // Only a missing <item> means no notices: the parser turns an empty one
    // into "", which must still count (and fail) as a notice.
    const items: unknown[] = (
      Array.isArray(rawItems)
        ? rawItems
        : rawItems === undefined
          ? []
          : [rawItems]
    ).slice(0, MAX_FEED_ITEMS);

    // Skip (never serve) a notice that is malformed or unsafe. Log the skips
    // as one line per fetch so a feed of many bad notices can't flood the logs.
    const outages: Outage[] = [];
    const skipped: string[] = [];
    for (const raw of items) {
      try {
        outages.push(this.toOutage(rssItemSchema.parse(raw)));
      } catch (err) {
        skipped.push(`${noticeRef(raw)} (${reason(err)})`);
      }
    }
    if (skipped.length > 0) {
      this.logger.warn(
        `Skipped ${skipped.length} invalid BWA notice(s): ${skipped.slice(0, 5).join(" | ")}`,
      );
    }
    // Notices exist but none are usable: the feed format has likely changed.
    // An empty list would wrongly tell residents there are no outages.
    if (items.length > 0 && outages.length === 0) {
      throw new Error("No valid notices in BWA RSS feed");
    }
    return outages;
  }

  private toOutage(item: z.infer<typeof rssItemSchema>): Outage {
    const link = new URL(decodeEntities(item.link));
    if (!["https:", "http:"].includes(link.protocol)) {
      throw new Error("Invalid BWA notice link");
    }
    const body = stripHtml(
      `${item.description ?? ""} ${item["content:encoded"] ?? ""}`,
    );
    // An untitled notice is still a real outage, so keep it and title it from
    // its body. The ID below never uses the title, so a later retitle by BWA
    // doesn't look like a new notice and re-send the alert.
    const givenTitle = stripHtml(item.title ?? "");
    const title = givenTitle || clip(body, 80) || "BWA service notice";
    // Search the body alone when the title was cut from it: the cut can split a
    // date from its year ("August 1…"), and dates are read from the first match.
    const haystack = givenTitle ? `${givenTitle} ${body}` : body;
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

/** The notice's guid or link, quoted and clipped, so a log line can trace it. */
function noticeRef(raw: unknown): string {
  const item = (raw ?? {}) as Record<string, unknown>;
  const ref = [item.guid, item.link].find(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  return ref ? JSON.stringify(clip(ref.trim(), 200)) : "(no ID)";
}

/**
 * One-line reason for an error (Zod errors are otherwise JSON). Used for a
 * skipped notice, and to lead the checker's ops alert email (#2970).
 */
export function reason(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .map((i) => `${i.path.join(".") || "item"}: ${i.message}`)
      .join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}
