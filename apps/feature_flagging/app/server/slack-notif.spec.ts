import { vi } from "vitest";

const { getSlackWebhookUrl } = vi.hoisted(() => ({
  getSlackWebhookUrl: vi.fn(),
}));
vi.mock("./secrets", () => ({ getSlackWebhookUrl }));

import { mrkdwnEscape, sendSlackNotification } from "./slack-notif";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("sendSlackNotification", () => {
  it("posts the message to the resolved webhook URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    getSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/services/x");

    await sendSlackNotification("hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/x",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "hello" }),
      }),
    );
  });

  it("does not fetch when no webhook is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    getSlackWebhookUrl.mockResolvedValue(undefined);

    await sendSlackNotification("hello");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never rejects when the secret fetch fails (fail-soft)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    getSlackWebhookUrl.mockRejectedValue(
      new Error("Secrets Manager throttled"),
    );

    await expect(sendSlackNotification("hello")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never rejects when Slack delivery fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    getSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/services/x");

    await expect(sendSlackNotification("hello")).resolves.toBeUndefined();
  });
});

describe("mrkdwnEscape", () => {
  it("escapes &, < and > so text cannot break mrkdwn link syntax", () => {
    expect(mrkdwnEscape("Fish & chips <deluxe>")).toBe(
      "Fish &amp; chips &lt;deluxe&gt;",
    );
  });

  it("leaves plain titles untouched", () => {
    expect(mrkdwnEscape("Get a copy of a birth certificate")).toBe(
      "Get a copy of a birth certificate",
    );
  });
});
