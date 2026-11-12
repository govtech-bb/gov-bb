import { describe, expect, it, vi } from "vitest";
import { UmamiClient } from "./umami";

const range = { startAt: 1000, endAt: 2000 };

function mockFetchOnce(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

describe("UmamiClient.reportFunnel", () => {
  it("POSTs the funnel envelope and returns the step rows", async () => {
    const fetchSpy = mockFetchOnce([
      { type: "event", value: "f:form-start", visitors: 100, dropoff: null },
      {
        type: "event",
        value: "f:form-submit",
        visitors: 40,
        dropped: 60,
        dropoff: 0.6,
      },
    ]);
    vi.stubGlobal("fetch", fetchSpy);
    const client = new UmamiClient({ apiKey: "k" });
    const rows = await client.reportFunnel("w1", {
      steps: [
        { type: "event", value: "f:form-start" },
        { type: "event", value: "f:form-submit" },
      ],
      window: 60,
      range,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ value: "f:form-submit", visitors: 40 });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/reports/funnel");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      websiteId: "w1",
      type: "funnel",
      parameters: {
        window: 60,
        steps: [
          { type: "event", value: "f:form-start" },
          { type: "event", value: "f:form-submit" },
        ],
      },
    });
    expect(sent.parameters.startDate).toBeTruthy();
    expect(sent.parameters.endDate).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("UmamiClient.reportJourney", () => {
  it("POSTs the journey envelope and returns paths", async () => {
    const fetchSpy = mockFetchOnce([{ items: ["/", "/a"], count: 12 }]);
    vi.stubGlobal("fetch", fetchSpy);
    const client = new UmamiClient({ apiKey: "k" });
    const paths = await client.reportJourney("w1", { steps: 5, range });
    expect(paths[0]).toMatchObject({ items: ["/", "/a"], count: 12 });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/reports/journey");
    expect(init.method).toBe("POST");
    vi.unstubAllGlobals();
  });
});

describe("UmamiClient.eventDataValues", () => {
  it("GETs one event property's values, with no property filter by default", async () => {
    const fetchSpy = mockFetchOnce([{ value: "results", total: 3 }]);
    vi.stubGlobal("fetch", fetchSpy);
    const client = new UmamiClient({ apiKey: "k" });
    const rows = await client.eventDataValues(
      "w1",
      "tool-result",
      "tool",
      range,
    );
    expect(rows).toEqual([{ value: "results", total: 3 }]);
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.pathname).toContain("/websites/w1/event-data/values");
    expect(url.searchParams.get("event")).toBe("tool-result");
    expect(url.searchParams.get("propertyName")).toBe("tool");
    expect(url.searchParams.has("epf1")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("keeps only events whose string property equals a value (Umami's epf filter)", async () => {
    const fetchSpy = mockFetchOnce([]);
    vi.stubGlobal("fetch", fetchSpy);
    const client = new UmamiClient({ apiKey: "k" });
    await client.eventDataValues("w1", "tool-result", "outcome", range, {
      property: "tool",
      equals: "water-outages",
    });
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get("propertyName")).toBe("outcome");
    // <dataType 1 = string>.<operator>.<property>.<value>
    expect(url.searchParams.get("epf1")).toBe("1.eq.tool.water-outages");
    vi.unstubAllGlobals();
  });
});
