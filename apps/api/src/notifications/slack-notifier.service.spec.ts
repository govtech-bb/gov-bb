import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { SlackNotifierService, mrkdwnEscape } from "./slack-notifier.service";

const WEBHOOK = "https://hooks.slack.com/services/x";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("SlackNotifierService", () => {
  it("posts the message text to the configured webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await new SlackNotifierService(WEBHOOK).notify("hello");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init.body)).toEqual({ text: "hello" });
  });

  it("warns on a non-2xx Slack response and still does not throw", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(
      new SlackNotifierService(WEBHOOK).notify("hello"),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("404"));
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

  describe("onApplicationBootstrap — configured-state log", () => {
    it("warns in production when the webhook is unset", () => {
      const warn = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      vi.stubEnv("NODE_ENV", "production");

      new SlackNotifierService("").onApplicationBootstrap();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("SLACK_ALERTS_WEBHOOK_URL unset"),
      );
    });

    it("stays quiet at boot when a webhook is configured", () => {
      const warn = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      const debug = vi
        .spyOn(Logger.prototype, "debug")
        .mockImplementation(() => {});

      new SlackNotifierService(WEBHOOK).onApplicationBootstrap();

      expect(warn).not.toHaveBeenCalled();
      expect(debug).not.toHaveBeenCalled();
    });
  });
});

describe("mrkdwnEscape", () => {
  it("escapes &, < and > so text cannot break out of a link", () => {
    expect(mrkdwnEscape("a & b <c> d")).toBe("a &amp; b &lt;c&gt; d");
  });
});
