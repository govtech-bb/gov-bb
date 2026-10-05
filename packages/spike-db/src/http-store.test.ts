import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpStore } from "./http-store";

function stubFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

const contentType = (init: RequestInit) =>
  new Headers(init.headers).get("content-type");

describe("HttpStore", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Fastify refuses a JSON content type with an empty body, so a DELETE that
  // claimed one failed on the server and nothing was ever removed.
  it("sends no Content-Type on a request without a body", async () => {
    const calls = stubFetch();
    const store = new HttpStore("http://api.test");

    await store.deleteRecord("parishes", "st-lucy");
    await store.delete("page-1");

    expect(calls.map((call) => call.init.method)).toEqual(["DELETE", "DELETE"]);
    for (const call of calls) expect(contentType(call.init)).toBeNull();
  });

  it("still declares JSON on a request with a body", async () => {
    const calls = stubFetch();
    const store = new HttpStore("http://api.test");

    await store.saveRecord("parishes", "st-lucy", { key: "st-lucy" });

    expect(contentType(calls[0]!.init)).toBe("application/json");
  });
});
