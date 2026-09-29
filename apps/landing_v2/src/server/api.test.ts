import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Dispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, createCachingDispatcher } from "./api";

/** The exact policy api_v2 sends on its public reads. */
const PUBLIC_READ =
  "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400";

/** The policy api_v2 sends on the public by-url 404 (#2835). */
const NOT_FOUND_READ = "public, max-age=10";

type Respond = (req: IncomingMessage) => {
  status: number;
  body?: unknown;
  cacheControl?: string;
  hold?: Promise<void>;
  holdBody?: Promise<void>;
};

/**
 * A throwaway api_v2: every request is recorded, and `respond` decides the
 * answer. No `Date` header, so the cache's idea of a response's age comes
 * from the (faked) clock alone and not from the real one. `hold` delays the
 * whole response; `holdBody` sends the headers first and delays the body.
 */
async function startApi(initial: Respond) {
  const requests: IncomingMessage[] = [];
  const state = { respond: initial };
  const server: Server = createServer(async (req, res) => {
    requests.push(req);
    const { status, body, cacheControl, hold, holdBody } = state.respond(req);
    await hold;
    res.sendDate = false;
    res.statusCode = status;
    if (cacheControl) res.setHeader("cache-control", cacheControl);
    res.setHeader("content-type", "application/json");
    if (holdBody) {
      res.flushHeaders();
      await holdBody;
    }
    res.end(JSON.stringify(body ?? { error: status }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return { baseUrl: `http://127.0.0.1:${port}`, requests, state, close };
}

let dispatcher: Dispatcher;
let api: Awaited<ReturnType<typeof startApi>> | undefined;

beforeEach(() => {
  // Only the clock is faked, so real sockets and real timers still work.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
  // A fresh cache per test, composed exactly as production composes it.
  dispatcher = createCachingDispatcher();
});

afterEach(async () => {
  await dispatcher.destroy();
  await api?.close();
  api = undefined;
  vi.useRealTimers();
});

const advanceClock = (seconds: number) =>
  vi.setSystemTime(Date.now() + seconds * 1000);

describe("apiGet", () => {
  it("makes one request for two calls within max-age", async () => {
    api = await startApi(() => ({
      status: 200,
      body: { v: 1 },
      cacheControl: PUBLIC_READ,
    }));
    const client = createApiClient(api.baseUrl, dispatcher);

    const first = await client.apiGet("/pages");
    advanceClock(59);
    const second = await client.apiGet("/pages");

    expect(first).toEqual({ kind: "ok", body: { v: 1 } });
    expect(second).toEqual({ kind: "ok", body: { v: 1 } });
    expect(api.requests).toHaveLength(1);
  });

  it("serves a stale entry while one background request revalidates it", async () => {
    api = await startApi(() => ({
      status: 200,
      body: { v: 1 },
      cacheControl: PUBLIC_READ,
    }));
    const client = createApiClient(api.baseUrl, dispatcher);
    await client.apiGet("/pages");

    // Past max-age, inside stale-while-revalidate. The revalidation is held
    // open on the server, so the stale answer cannot have waited for it.
    advanceClock(61);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let arrived!: () => void;
    const revalidationArrived = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    api.state.respond = () => {
      arrived();
      return {
        status: 200,
        body: { v: 2 },
        cacheControl: PUBLIC_READ,
        hold: held,
      };
    };

    const stale = await client.apiGet("/pages");
    await revalidationArrived;

    expect(stale).toEqual({ kind: "ok", body: { v: 1 } });
    expect(api.requests).toHaveLength(2);
    expect(api.requests[1].headers["if-modified-since"]).toBeDefined();

    // Once the background request lands, the fresh copy is what is served.
    release();
    api.state.respond = () => ({
      status: 200,
      body: { v: 2 },
      cacheControl: PUBLIC_READ,
    });
    await vi.waitFor(async () =>
      expect(await client.apiGet("/pages")).toEqual({
        kind: "ok",
        body: { v: 2 },
      }),
    );
  });

  it("serves the cached copy when api_v2 answers 500 after expiry", async () => {
    api = await startApi(() => ({
      status: 200,
      body: { v: 1 },
      cacheControl: PUBLIC_READ,
    }));
    const client = createApiClient(api.baseUrl, dispatcher);
    await client.apiGet("/pages");

    // Past max-age and stale-while-revalidate, inside stale-if-error.
    advanceClock(60 + 300 + 1);
    api.state.respond = () => ({ status: 500 });

    expect(await client.apiGet("/pages")).toEqual({
      kind: "ok",
      body: { v: 1 },
    });
    expect(api.requests).toHaveLength(2);
  });

  it("returns unreachable for a refused connection with nothing cached", async () => {
    // Bind a port, then free it, so nothing is listening there.
    const closed = await startApi(() => ({ status: 200 }));
    await closed.close();
    const client = createApiClient(closed.baseUrl, dispatcher);

    expect(await client.apiGet("/pages")).toMatchObject({
      kind: "unreachable",
    });
  });

  it("tells a 404 apart from a 5xx", async () => {
    api = await startApi((req) => ({
      status: req.url === "/missing" ? 404 : 502,
    }));
    const client = createApiClient(api.baseUrl, dispatcher);

    expect(await client.apiGet("/missing")).toEqual({ kind: "not_found" });
    expect(await client.apiGet("/broken")).toEqual({
      kind: "server_error",
      status: 502,
    });
  });

  it("makes one request for two lookups of a missing page within ten seconds", async () => {
    api = await startApi(() => ({ status: 404, cacheControl: NOT_FOUND_READ }));
    const client = createApiClient(api.baseUrl, dispatcher);

    const first = await client.apiGet("/pages/by-url?url=/nope");
    advanceClock(9);
    const second = await client.apiGet("/pages/by-url?url=/nope");

    expect(first).toEqual({ kind: "not_found" });
    expect(second).toEqual({ kind: "not_found" });
    expect(api.requests).toHaveLength(1);

    // Past max-age: the next lookup goes back to api_v2.
    advanceClock(2);
    expect(await client.apiGet("/pages/by-url?url=/nope")).toEqual({
      kind: "not_found",
    });
    expect(api.requests).toHaveLength(2);
  });

  it("caches the 404 even when its body arrives after the headers", async () => {
    api = await startApi(() => ({
      status: 404,
      cacheControl: NOT_FOUND_READ,
      holdBody: new Promise((resolve) => setTimeout(resolve, 50)),
    }));
    const client = createApiClient(api.baseUrl, dispatcher);

    const first = await client.apiGet("/pages/by-url?url=/nope");
    advanceClock(9);
    const second = await client.apiGet("/pages/by-url?url=/nope");

    expect(first).toEqual({ kind: "not_found" });
    expect(second).toEqual({ kind: "not_found" });
    expect(api.requests).toHaveLength(1);
  });

  it("returns unreachable with the undici timeout code when api_v2 hangs", async () => {
    // Accepts the connection but never sends a response.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    api = await startApi(() => ({ status: 200, hold: held }));
    const timingOut = createCachingDispatcher({
      headersTimeout: 200,
      bodyTimeout: 200,
    });
    const client = createApiClient(api.baseUrl, timingOut);

    const result = await client.apiGet("/pages");

    expect(result.kind).toBe("unreachable");
    const cause = (result as { cause: unknown }).cause as {
      cause?: { code?: string };
    };
    expect(cause.cause?.code).toBe("UND_ERR_HEADERS_TIMEOUT");

    release();
    await timingOut.destroy();
  });
});
