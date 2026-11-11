import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { THROTTLERS } from "@/common/throttlers";
import { SubmissionStatusController } from "./submission-status.controller";
import { SubmissionStatusService } from "./submission-status.service";

const TOKEN = "chat-caller-token-value";
const PATH = "/submissions/MOH-TRL-2610-47E4AE6/status";
// The global `short` bucket: what a direct caller gets in 10 seconds.
const PER_IP_SHORT = THROTTLERS.find((t) => t.name === "short")!.limit;

/**
 * The status route's throttle through the real ThrottlerGuard and the API's own
 * limits (#3623). Every request here comes from one address, as every chat
 * lookup does. A fresh app per test, so each starts with empty counters.
 */
describe("GET /submissions/:reference/status — throttle", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.CHAT_CALLER_TOKEN = TOKEN;

    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([...THROTTLERS])],
      controllers: [SubmissionStatusController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: SubmissionStatusService,
          useValue: { lookup: async () => ({ kind: "not_found" }) },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    delete process.env.CHAT_CALLER_TOKEN;
    await app.close();
  });

  /** The status of each of `count` lookups, made one after another. */
  async function lookups(count: number, token?: string): Promise<number[]> {
    const statuses: number[] = [];

    for (let i = 0; i < count; i++) {
      const req = request(app.getHttpServer()).get(PATH);
      const res = await (token === undefined
        ? req
        : req.set("X-Chat-Caller-Token", token));
      statuses.push(res.status);
    }

    return statuses;
  }

  it("lets the chat past one address's limit", async () => {
    const statuses = await lookups(PER_IP_SHORT + 1, TOKEN);

    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it("limits a caller without the token per IP, as before", async () => {
    const statuses = await lookups(PER_IP_SHORT + 1);

    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, PER_IP_SHORT).every((s) => s === 200)).toBe(true);
  });

  it("limits a caller with a wrong token per IP", async () => {
    const statuses = await lookups(PER_IP_SHORT + 1, "not-the-token");

    expect(statuses.at(-1)).toBe(429);
  });

  // The chat has its own counter, so its traffic does not use up the
  // allowance of a direct caller who happens to share its address.
  it("does not count the chat's lookups against a direct caller on the same address", async () => {
    await lookups(PER_IP_SHORT + 1, TOKEN);

    expect(await lookups(1)).toEqual([200]);
  });

  it("gives nobody the chat's limit when the API has no token", async () => {
    process.env.CHAT_CALLER_TOKEN = "";

    const statuses = await lookups(PER_IP_SHORT + 1, "");

    expect(statuses.at(-1)).toBe(429);
  });
});
