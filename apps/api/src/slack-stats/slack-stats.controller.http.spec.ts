import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createHmac, randomBytes } from "node:crypto";
import request from "supertest";
import { useBodyParsers } from "@/common/body-parsers";
import { SlackStatsController } from "./slack-stats.controller";
import { SlackStatsService } from "./slack-stats.service";

/**
 * Wire-level test for POST /slack/commands/stats: Slack posts the command as
 * application/x-www-form-urlencoded and signs the raw bytes, so this boots the
 * controller the way main.ts does (`rawBody: true` plus `useBodyParsers`) to
 * prove the urlencoded raw body reaches the signature check.
 */

// Random per run: a throwaway key for signing test requests, not a credential.
const SECRET = randomBytes(32).toString("hex");

describe("POST /slack/commands/stats over HTTP", () => {
  let app: NestExpressApplication;
  const stats = { isConfigured: vi.fn(), respond: vi.fn() };
  const env: Record<string, string> = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SlackStatsController],
      providers: [
        { provide: SlackStatsService, useValue: stats },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    useBodyParsers(app);
    await app.init();
  });

  beforeEach(() => {
    env.SLACK_SIGNING_SECRET = SECRET;
    stats.isConfigured.mockReset().mockReturnValue(true);
    stats.respond.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const form = (fields: Record<string, string>) =>
    new URLSearchParams({
      command: "/stats",
      response_url: "https://hooks.slack.com/commands/T1/1/abc",
      ...fields,
    }).toString();

  const post = (raw: string, opts: { secret?: string; ts?: number } = {}) => {
    const ts = opts.ts ?? Math.floor(Date.now() / 1000);
    const sig =
      "v0=" +
      createHmac("sha256", opts.secret ?? SECRET)
        .update(`v0:${ts}:${raw}`)
        .digest("hex");
    return request(app.getHttpServer())
      .post("/slack/commands/stats")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .set("X-Slack-Request-Timestamp", String(ts))
      .set("X-Slack-Signature", sig)
      .send(raw);
  };

  it("acknowledges a signed command and starts the reply", async () => {
    const res = await post(form({ text: "week" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      response_type: "ephemeral",
      text: "Getting the stats. This takes about a minute…",
    });
    expect(stats.respond).toHaveBeenCalledWith(
      { command: "/stats", kind: "stats", period: "week" },
      "https://hooks.slack.com/commands/T1/1/abc",
    );
  });

  it("names the form while it works on a single form", async () => {
    const res = await post(form({ text: "month passport-renewal" }));
    expect(res.body.text).toBe("Getting stats for `passport-renewal`…");
  });

  it("refuses a request signed with another secret", async () => {
    const res = await post(form({ text: "week" }), { secret: "wrong" });
    expect(res.status).toBe(401);
    expect(stats.respond).not.toHaveBeenCalled();
  });

  it("refuses a replayed request older than 5 minutes", async () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    const res = await post(form({ text: "week" }), { ts: old });
    expect(res.status).toBe(401);
  });

  it("refuses everything when no signing secret is set", async () => {
    delete env.SLACK_SIGNING_SECRET;
    const res = await post(form({ text: "week" }), { secret: "" });
    expect(res.status).toBe(401);
  });

  it("replies with usage for an unknown period", async () => {
    const res = await post(form({ text: "year" }));
    expect(res.body.text).toContain(
      "*Usage:* `/stats <today|week|month> [form-id]`",
    );
    expect(stats.respond).not.toHaveBeenCalled();
  });

  it("says so when Umami isn't configured", async () => {
    stats.isConfigured.mockReturnValue(false);
    const res = await post(form({ text: "week" }));
    expect(res.body.text).toBe("Stats are not set up in this environment yet.");
  });

  it("never posts to a response url that isn't Slack's", async () => {
    const res = await post(
      form({ text: "week", response_url: "https://evil.example/hook" }),
    );
    expect(res.body.text).toContain("can't answer");
    expect(stats.respond).not.toHaveBeenCalled();
  });

  it("defaults the command name and text when Slack leaves them out", async () => {
    const res = await post(new URLSearchParams({}).toString());
    expect(res.body.text).toContain("`/stats <today|week|month> [form-id]`");
  });
});
