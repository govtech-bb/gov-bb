import type { ExecutionContext } from "@nestjs/common";
import { THROTTLERS } from "@/common/throttlers";
import {
  CHAT_LIMITS,
  isChatCaller,
  STATUS_LOOKUP_THROTTLE,
} from "./chat-caller-throttle";

const TOKEN = "chat-caller-token-value";

function request(header?: string | string[], ip = "203.0.113.7") {
  return {
    ip,
    headers: header === undefined ? {} : { "x-chat-caller-token": header },
  };
}

function contextFor(req: ReturnType<typeof request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/** What the guard would use for one bucket: the limit and the counter key. */
async function resolve(bucket: string, req: ReturnType<typeof request>) {
  const options = STATUS_LOOKUP_THROTTLE[bucket];
  const ctx = contextFor(req);

  return {
    limit: options.limit(ctx),
    tracker: await options.getTracker(req, ctx),
  };
}

describe("chat caller throttle (#3623)", () => {
  afterEach(() => {
    delete process.env.CHAT_CALLER_TOKEN;
  });

  it("covers every global bucket, so none is left on the per-IP default", () => {
    expect(Object.keys(STATUS_LOOKUP_THROTTLE)).toEqual(
      THROTTLERS.map((t) => t.name),
    );
  });

  it("gives a valid token the chat's limits, counted together as one caller", async () => {
    process.env.CHAT_CALLER_TOKEN = TOKEN;

    await expect(resolve("short", request(TOKEN))).resolves.toEqual({
      limit: 50,
      tracker: "chat",
    });
    await expect(resolve("medium", request(TOKEN))).resolves.toEqual({
      limit: 300,
      tracker: "chat",
    });
    await expect(resolve("long", request(TOKEN))).resolves.toEqual({
      limit: 3_000,
      tracker: "chat",
    });
  });

  // #2420: a `short` under a sixth of `medium` would cap the chat below the
  // rate `medium` claims to allow.
  it("keeps the chat's 10-second limit in step with its per-minute one", () => {
    expect(CHAT_LIMITS.short).toBeGreaterThanOrEqual(CHAT_LIMITS.medium / 6);
  });

  it.each([
    ["no header", undefined],
    ["a wrong token", "not-the-token"],
    ["an empty header", ""],
    // Node joins a repeated header into one value.
    ["a repeated header", `${TOKEN}, ${TOKEN}`],
    ["a token in the wrong case", TOKEN.toUpperCase()],
  ])("keeps %s on the per-IP limits", async (_label, header) => {
    process.env.CHAT_CALLER_TOKEN = TOKEN;

    for (const { name, limit } of THROTTLERS) {
      await expect(resolve(name, request(header))).resolves.toEqual({
        limit,
        tracker: "203.0.113.7",
      });
    }
  });

  it("gives nobody the chat's limits when the API has no token, even an empty header", () => {
    process.env.CHAT_CALLER_TOKEN = "";

    expect(isChatCaller(request(""))).toBe(false);
    expect(isChatCaller(request("anything"))).toBe(false);
  });
});
