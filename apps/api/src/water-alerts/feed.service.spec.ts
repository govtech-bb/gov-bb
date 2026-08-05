import type { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { FeedService } from "./feed.service";

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Service Disruptions</title>
    <item>
      <title>Emergency repair in St. Michael &#038; St. George</title>
      <link>https://barbadoswaterauthority.com/notice-1</link>
      <guid>notice-1</guid>
      <pubDate>Mon, 22 Jun 2026 08:00:00 +0000</pubDate>
      <description>Burst main. Work on Tuesday, June 23rd between 9:00 a.m. and 7:00 p.m.</description>
    </item>
    <item>
      <title>General notice</title>
      <link>https://barbadoswaterauthority.com/notice-2</link>
      <guid>notice-2</guid>
      <pubDate>Mon, 22 Jun 2026 09:00:00 +0000</pubDate>
      <description>Island-wide advisory.</description>
    </item>
  </channel>
</rss>`;

function makeHttp(returnValue: unknown): HttpService {
  return {
    get: vi.fn().mockReturnValue(returnValue),
  } as unknown as HttpService;
}

describe("FeedService", () => {
  it("parses the BWA feed into tagged outages", async () => {
    const service = new FeedService(makeHttp(of({ data: SAMPLE_FEED })));
    const outages = await service.fetchOutages();

    expect(outages).toHaveLength(2);
    const [first, second] = outages;

    expect(first.id).toBe("notice-1");
    // Entity decoded, tags stripped.
    expect(first.title).toBe("Emergency repair in St. Michael & St. George");
    expect(first.type).toBe("emergency");
    expect(first.parishes).toEqual(["saint-george", "saint-michael"]);
    expect(first.eventDay).toBe("2026-06-23");
    expect(first.endsAt).toBe(
      new Date(Date.UTC(2026, 5, 23, 23, 0)).toISOString(),
    );

    expect(second.id).toBe("notice-2");
    expect(second.parishes).toEqual([]);
  });

  it("serves a cached parse within the TTL (one upstream call)", async () => {
    const http = makeHttp(of({ data: SAMPLE_FEED }));
    const service = new FeedService(http);
    await service.fetchOutages();
    await service.fetchOutages();
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it("throws when the feed is unreachable", async () => {
    const service = new FeedService(
      makeHttp(throwError(() => new Error("ECONNREFUSED"))),
    );
    await expect(service.fetchOutages()).rejects.toThrow("ECONNREFUSED");
  });
});
