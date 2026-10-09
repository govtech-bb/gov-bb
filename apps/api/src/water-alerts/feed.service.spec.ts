import type { HttpService } from "@nestjs/axios";
import { Logger } from "@nestjs/common";
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
  afterEach(() => {
    vi.useRealTimers();
    // Restore Logger spies even when an assertion fails mid-test.
    vi.restoreAllMocks();
  });

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

  it("does not cache a feed with no valid notices, so the next fetch recovers", async () => {
    // Caching the failure (or caching before parsing) would keep the page on
    // "unavailable" for ten minutes after BWA fixes the feed.
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const get = vi
      .fn()
      .mockReturnValueOnce(
        of({
          data: SAMPLE_FEED.replaceAll(
            /<pubDate>[^<]*<\/pubDate>/g,
            "<pubDate>not a date</pubDate>",
          ),
        }),
      )
      .mockReturnValueOnce(of({ data: SAMPLE_FEED }));
    const service = new FeedService({ get } as unknown as HttpService);

    await expect(service.fetchOutages()).rejects.toThrow("No valid notices");
    expect((await service.fetchOutages()).outages).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it.each([
    "<html><body>Maintenance</body></html>",
    "<rss><channel><title>Unclosed feed</title></rss>",
    "<!DOCTYPE rss [<!ENTITY notice 'expanded'>]><rss><channel><title>&notice;</title></channel></rss>",
  ])("rejects a malformed or unsafe feed (%#)", async (xml) => {
    const service = new FeedService(makeHttp(of({ data: xml })));
    await expect(service.fetchOutages()).rejects.toThrow();
  });

  // One bad notice must not take down every other notice (#2969): it is
  // skipped — never served — and logged, and the valid notice is kept.
  it.each([
    [
      "a nested-HTML title",
      SAMPLE_FEED.replace(
        "<title>General notice</title>",
        "<title><b>Nested</b></title>",
      ),
      "notice-1",
      '"notice-2"',
    ],
    [
      "an invalid date",
      SAMPLE_FEED.replace("Mon, 22 Jun 2026 08:00:00 +0000", "not a date"),
      "notice-2",
      '"notice-1"',
    ],
    [
      "a javascript: link",
      SAMPLE_FEED.replace(
        "https://barbadoswaterauthority.com/notice-1",
        "javascript:alert(1)",
      ),
      "notice-2",
      '"notice-1"',
    ],
    [
      "a data: link",
      SAMPLE_FEED.replace(
        "https://barbadoswaterauthority.com/notice-1",
        "data:text/html,hello",
      ),
      "notice-2",
      '"notice-1"',
    ],
    [
      "no link",
      SAMPLE_FEED.replace(
        "<link>https://barbadoswaterauthority.com/notice-1</link>",
        "",
      ),
      "notice-2",
      '"notice-1"',
    ],
    [
      "an over-long ID",
      SAMPLE_FEED.replace("<guid>notice-1</guid>", "").replace(
        "https://barbadoswaterauthority.com/notice-1",
        `https://barbadoswaterauthority.com/${"x".repeat(512)}`,
      ),
      "notice-2",
      // No guid, so the (clipped) link identifies it.
      '"https://barbadoswaterauthority.com/xxx',
    ],
    [
      "an empty guid",
      SAMPLE_FEED.replace("<guid>notice-1</guid>", "<guid></guid>").replace(
        "https://barbadoswaterauthority.com/notice-1",
        "javascript:alert(1)",
      ),
      "notice-2",
      // An empty guid must not hide the link that identifies the notice.
      '"javascript:alert(1)"',
    ],
  ])(
    "skips a notice with %s and keeps the rest",
    async (_, xml, keptId, loggedRef) => {
      const warn = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      const service = new FeedService(makeHttp(of({ data: xml })));

      const { outages } = await service.fetchOutages();

      expect(outages.map((o) => o.id)).toEqual([keptId]);
      expect(warn).toHaveBeenCalledTimes(1);
      // Logged with the skipped notice's guid (or link), so ops can trace it.
      expect(warn.mock.calls[0][0]).toContain(
        `Skipped 1 invalid BWA notice(s): ${loggedRef}`,
      );
    },
  );

  it("reads at most 100 notices and logs every skip in one line", async () => {
    // A hostile feed of many bad notices must not flood the logs or hold the
    // event loop: one summary line per fetch, not one line per notice.
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const xml = SAMPLE_FEED.replace(
      "</channel>",
      `${"<item><link>x</link></item>".repeat(200)}</channel>`,
    );
    const service = new FeedService(makeHttp(of({ data: xml })));

    const { outages } = await service.fetchOutages();

    expect(outages.map((o) => o.id)).toEqual(["notice-1", "notice-2"]);
    expect(warn).toHaveBeenCalledTimes(1);
    // 100 read, 2 valid: 98 skipped, and only the first 5 are listed.
    expect(warn.mock.calls[0][0]).toMatch(
      /^Skipped 98 invalid BWA notice\(s\): "x" \(.*\)( \| "x" \(.*\)){4}$/,
    );
  });

  // An empty list here would tell residents there are no outages when the
  // feed format has really changed, so fail honestly instead.
  it.each([
    [
      "every notice is invalid",
      SAMPLE_FEED.replaceAll(
        /<pubDate>[^<]*<\/pubDate>/g,
        "<pubDate>not a date</pubDate>",
      ),
    ],
    // The parser turns a lone empty <item> into "", not an object.
    ["its only notice is <item/>", "<rss><channel><item/></channel></rss>"],
    [
      "its only notice is empty",
      "<rss><channel><item>  </item></channel></rss>",
    ],
  ])("rejects the feed when %s", async (_, xml) => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new FeedService(makeHttp(of({ data: xml })));
    await expect(service.fetchOutages()).rejects.toThrow(
      "No valid notices in BWA RSS feed",
    );
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

  // #2969: BWA published a notice with an empty <title>, which used to fail
  // the whole feed — taking down the public page and every alert.
  describe("untitled notices", () => {
    const GOLDEN_RIDGE_BODY =
      "The Barbados Water Authority (BWA) advises residents and businesses in parts of St. Andrew, St. Thomas and St. Joseph that the large-diameter main in Golden Ridge Village, St. George, has ruptured again today.";

    function untitledFeed(titleXml: string, description = GOLDEN_RIDGE_BODY) {
      return `<rss><channel><item>
        ${titleXml}
        <link>https://barbadoswaterauthority.com/14535-2/</link>
        <guid>https://barbadoswaterauthority.com/?p=14535</guid>
        <pubDate>Sun, 04 Oct 2026 19:02:25 +0000</pubDate>
        <description>${description}</description>
      </item></channel></rss>`;
    }

    async function onlyOutage(xml: string) {
      const service = new FeedService(makeHttp(of({ data: xml })));
      const { outages } = await service.fetchOutages();
      expect(outages).toHaveLength(1);
      return outages[0];
    }

    it.each([
      ["an empty title", "<title></title>"],
      ["no title element", ""],
      ["a whitespace-only title", "<title>   </title>"],
      ["an HTML-only title", "<title><![CDATA[<p> </p>]]></title>"],
    ])("keeps a notice with %s, titled from its body", async (_, titleXml) => {
      const outage = await onlyOutage(untitledFeed(titleXml));

      expect(outage.title).toBe(
        "The Barbados Water Authority (BWA) advises residents and businesses in parts of…",
      );
      // Still matched to parishes, so subscribers there are alerted.
      expect(outage.parishes).toEqual(
        expect.arrayContaining(["saint-andrew", "saint-thomas"]),
      );
    });

    it("reads an untitled notice's dates from its body, not its clipped title", async () => {
      // The 80-char title cut lands between "August 1," and "2026". Reading the
      // title first found "August 1" with no year and guessed 2027.
      const outage = await onlyOutage(
        untitledFeed(
          "<title></title>",
          "Low pressure in St. Lucy continues after repairs to a main that began August 1, 2026, the BWA said.",
        ),
      );
      expect(outage.title).toMatch(/August 1…$/);
      expect(outage.eventDay).toBe("2026-08-01");
    });

    it("falls back to a generic title when the body is empty too", async () => {
      const outage = await onlyOutage(untitledFeed("<title></title>", ""));
      expect(outage.title).toBe("BWA service notice");
    });

    it("keeps the notice ID independent of the fallback title", async () => {
      // A later retitle by BWA must not look like a new notice (no re-send).
      const untitled = await onlyOutage(untitledFeed("<title></title>"));
      const titled = await onlyOutage(
        untitledFeed("<title>Golden Ridge main ruptured</title>"),
      );
      expect(untitled.id).toBe("https://barbadoswaterauthority.com/?p=14535");
      expect(titled.id).toBe(untitled.id);
    });
  });
});

describe("FeedService.fetchOutagesWithSkips (#2970)", () => {
  afterEach(() => vi.restoreAllMocks());
  const ONE_BAD = SAMPLE_FEED.replace(
    "https://barbadoswaterauthority.com/notice-1",
    "javascript:alert(1)",
  );
  const quietLogs = () =>
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

  it("gives the checker each skipped notice's ref and a one-line reason", async () => {
    quietLogs();
    const service = new FeedService(makeHttp(of({ data: ONE_BAD })));

    const { feed, skipped } = await service.fetchOutagesWithSkips();

    expect(feed.outages.map((o) => o.id)).toEqual(["notice-2"]);
    expect(skipped).toEqual([
      {
        key: expect.stringMatching(/^[0-9a-f]{64}$/),
        ref: '"notice-1"',
        reason: expect.stringMatching(/^[^\n]+$/),
      },
    ]);
  });

  it("keys by the full guid: stable across reasons, distinct past the clipped ref", async () => {
    quietLogs();
    const longA = `${"g".repeat(250)}-a`;
    const longB = `${"g".repeat(250)}-b`;
    const feedWith = (guid: string, link: string) =>
      SAMPLE_FEED.replace(
        "<guid>notice-1</guid>",
        `<guid>${guid}</guid>`,
      ).replace("https://barbadoswaterauthority.com/notice-1", link);
    const skipsOf = async (xml: string) =>
      (
        await new FeedService(
          makeHttp(of({ data: xml })),
        ).fetchOutagesWithSkips()
      ).skipped;

    const [a] = await skipsOf(feedWith(longA, "javascript:alert(1)"));
    const [aOtherReason] = await skipsOf(feedWith(longA, "not a url"));
    const [b] = await skipsOf(feedWith(longB, "javascript:alert(1)"));

    expect(aOtherReason.reason).not.toBe(a.reason);
    expect(aOtherReason.key).toBe(a.key);
    expect(b.ref).toBe(a.ref); // both clipped to the same display ref
    expect(b.key).not.toBe(a.key);
  });

  it("keys each skipped notice stably and distinctly, even without a guid or link", async () => {
    // The display ref is clipped and "(no ID)" for ID-less notices, so it
    // can't be the key: two different notices would be reported as one.
    quietLogs();
    const twoWithoutIds = SAMPLE_FEED.replace(
      "</channel>",
      "<item><title>A</title></item><item><title>B</title></item></channel>",
    );
    const fetchSkips = async () =>
      (
        await new FeedService(
          makeHttp(of({ data: twoWithoutIds })),
        ).fetchOutagesWithSkips()
      ).skipped;

    const first = await fetchSkips();
    const again = await fetchSkips();

    expect(first.map((s) => s.ref)).toEqual(["(no ID)", "(no ID)"]);
    expect(new Set(first.map((s) => s.key)).size).toBe(2);
    expect(again.map((s) => s.key)).toEqual(first.map((s) => s.key));
  });

  it("keeps skips out of the public feed, which GET /water-alerts/outages returns as-is", async () => {
    quietLogs();
    const service = new FeedService(makeHttp(of({ data: ONE_BAD })));

    const feed = await service.fetchOutages();

    expect(Object.keys(feed).sort()).toEqual(["checkedAt", "outages"]);
  });

  it("shares one cached fetch between the public feed and the checker", async () => {
    quietLogs();
    const http = makeHttp(of({ data: ONE_BAD }));
    const service = new FeedService(http);

    await service.fetchOutages();
    const { skipped } = await service.fetchOutagesWithSkips();

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(skipped).toHaveLength(1);
  });
});
