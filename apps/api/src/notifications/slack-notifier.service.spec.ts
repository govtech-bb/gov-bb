import { afterEach, describe, expect, it, vi } from "vitest";
import { SlackNotifierService, mrkdwnEscape } from "./slack-notifier.service";

const WEBHOOK = "https://hooks.slack.com/services/x";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SlackNotifierService", () => {
  it("posts the message text to the configured webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);

    await new SlackNotifierService(WEBHOOK).notify("hello");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init.body)).toEqual({ text: "hello" });
  });

  it("is a no-op when no webhook is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await new SlackNotifierService("").notify("hello");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when Slack delivery fails (fail-soft)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(
      new SlackNotifierService(WEBHOOK).notify("hello"),
    ).resolves.toBeUndefined();
  });
});

describe("mrkdwnEscape", () => {
  it("escapes &, < and > so text cannot break out of a link", () => {
    expect(mrkdwnEscape("a & b <c> d")).toBe("a &amp; b &lt;c&gt; d");
  });
});
