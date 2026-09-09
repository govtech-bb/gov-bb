import type { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { buildAlertEmail } from "./emails";
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
  afterEach(() => vi.useRealTimers());

  it("parses the BWA feed into tagged outages", async () => {
    const service = new FeedService(makeHttp(of({ data: SAMPLE_FEED })));
    const { outages } = await service.fetchOutages();

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

  it("serves the original fetch timestamp from cache", async () => {
    vi.useFakeTimers();
    const http = makeHttp(of({ data: SAMPLE_FEED }));
    const service = new FeedService(http);
    const first = await service.fetchOutages();
    vi.advanceTimersByTime(5 * 60_000);
    const cached = await service.fetchOutages();
    expect(cached).toEqual(first);
    expect(cached.checkedAt).not.toBe(new Date().toISOString());
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeout: 10_000,
        maxContentLength: 2 * 1024 * 1024,
      }),
    );
  });

  it("does not serve an expired feed when refresh fails", async () => {
    vi.useFakeTimers();
    const http = makeHttp(of({ data: SAMPLE_FEED }));
    const service = new FeedService(http);
    await service.fetchOutages();
    vi.advanceTimersByTime(10 * 60_000);
    vi.mocked(http.get).mockReturnValue(
      throwError(() => new Error("feed down")),
    );
    await expect(service.fetchOutages()).rejects.toThrow("feed down");
  });

  it.each([
    "<html><body>Maintenance</body></html>",
    "<rss><channel><title>Unclosed feed</title></rss>",
    "<!DOCTYPE rss [<!ENTITY notice 'expanded'>]><rss><channel><title>&notice;</title></channel></rss>",
    SAMPLE_FEED.replace(
      "<title>General notice</title>",
      "<title><b>Nested</b></title>",
    ),
    SAMPLE_FEED.replace("Mon, 22 Jun 2026 08:00:00 +0000", "not a date"),
    SAMPLE_FEED.replace(
      "https://barbadoswaterauthority.com/notice-1",
      "javascript:alert(1)",
    ),
    SAMPLE_FEED.replace(
      "https://barbadoswaterauthority.com/notice-1",
      "data:text/html,hello",
    ),
    SAMPLE_FEED.replace(
      "<link>https://barbadoswaterauthority.com/notice-1</link>",
      "",
    ),
    SAMPLE_FEED.replace("<guid>notice-1</guid>", "").replace(
      "https://barbadoswaterauthority.com/notice-1",
      `https://barbadoswaterauthority.com/${"x".repeat(512)}`,
    ),
  ])("rejects malformed or unsafe upstream content (%#)", async (xml) => {
    const service = new FeedService(makeHttp(of({ data: xml })));
    await expect(service.fetchOutages()).rejects.toThrow();
  });

  it("accepts an empty RSS channel and keeps numeric GUIDs as strings", async () => {
    const empty = new FeedService(
      makeHttp(
        of({ data: "<rss><channel><title>BWA</title></channel></rss>" }),
      ),
    );
    expect((await empty.fetchOutages()).outages).toEqual([]);

    const numeric = new FeedService(
      makeHttp(
        of({
          data: SAMPLE_FEED.replace(
            "<guid>notice-1</guid>",
            '<guid isPermaLink="false">001</guid>',
          ),
        }),
      ),
    );
    expect((await numeric.fetchOutages()).outages[0].id).toBe("001");
  });

  it("uses the notice link as a stable ID and content when description is absent", async () => {
    const service = new FeedService(
      makeHttp(
        of({
          data: `
      <rss xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel><item>
          <title>Repair</title>
          <link>https://barbadoswaterauthority.com/notice</link>
          <pubDate>Mon, 22 Jun 2026 09:00:00 +0000</pubDate>
          <content:encoded><![CDATA[<p>Repair in St. Lucy.</p>]]></content:encoded>
        </item></channel>
      </rss>`,
        }),
      ),
    );
    const { outages } = await service.fetchOutages();
    expect(outages).toHaveLength(1);
    expect(outages[0]).toMatchObject({
      id: "https://barbadoswaterauthority.com/notice",
      summary: "Repair in St. Lucy.",
      parishes: ["saint-lucy"],
    });
  });

  it("escapes decoded feed content before rendering alert HTML", async () => {
    const service = new FeedService(
      makeHttp(
        of({
          data: SAMPLE_FEED.replace(
            "Emergency repair in St. Michael &#038; St. George",
            "<![CDATA[&lt;img src=x onerror=alert(1)&gt;]]>",
          ),
        }),
      ),
    );
    const { outages } = await service.fetchOutages();
    const email = buildAlertEmail(
      "All Barbados",
      outages[0],
      "https://gov.bb/unsubscribe?token=abc&source=email",
    );
    expect(email.html).toContain("&lt;img");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&amp;source");
  });

  it("throws when the feed is unreachable", async () => {
    const service = new FeedService(
      makeHttp(throwError(() => new Error("ECONNREFUSED"))),
    );
    await expect(service.fetchOutages()).rejects.toThrow("ECONNREFUSED");
  });
});
