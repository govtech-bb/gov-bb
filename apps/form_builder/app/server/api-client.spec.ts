/**
 * @vitest-environment node
 */

// getAdminApiToken reaches Secrets Manager / process.env; stub it so the SUT's
// only remaining external dependency is the global fetch we control here.
vi.mock("./secrets", () => ({
  getAdminApiToken: vi.fn().mockResolvedValue("test-token"),
}));

describe("api-client call() timeout", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env.BUILDER_API_URL = "https://api.test";
    delete process.env.BUILDER_API_TIMEOUT_MS;
  });

  afterEach(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it("translates an aborted/timed-out fetch into a clear typed error", async () => {
    // Simulate AbortSignal.timeout firing: fetch rejects with a DOMException
    // whose name is "TimeoutError" (Node 18+ / undici), or "AbortError".
    const abortErr = new DOMException(
      "The operation was aborted.",
      "TimeoutError",
    );
    (globalThis as { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockRejectedValue(abortErr) as unknown as typeof fetch;

    const { api } = await import("./api-client");

    await expect(api.post("/builder/ai/edit", {})).rejects.toThrow(
      /timed out/i,
    );
    // And it must not leak the raw DOMException message.
    await expect(api.post("/builder/ai/edit", {})).rejects.not.toThrow(
      /operation was aborted/i,
    );
  });

  it("passes an AbortSignal to fetch so the request is bounded", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    (globalThis as { fetch: typeof fetch }).fetch =
      fetchSpy as unknown as typeof fetch;

    const { api } = await import("./api-client");
    await api.post("/builder/ai/edit", {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
