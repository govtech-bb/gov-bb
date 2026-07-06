import { ttlCache } from "./ttl-cache";

describe("ttlCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the cached value on a fresh hit without re-invoking fn", async () => {
    const fn = vi.fn(async () => "v1");
    const cached = ttlCache(fn, 60_000);

    expect(await cached()).toBe("v1");
    expect(await cached()).toBe("v1");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps serving the cached value until the ttl elapses", async () => {
    let n = 0;
    const fn = vi.fn(async () => `v${++n}`);
    const cached = ttlCache(fn, 60_000);

    expect(await cached()).toBe("v1");
    vi.advanceTimersByTime(59_999);
    expect(await cached()).toBe("v1");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("refetches once the entry has expired", async () => {
    let n = 0;
    const fn = vi.fn(async () => `v${++n}`);
    const cached = ttlCache(fn, 60_000);

    expect(await cached()).toBe("v1");
    vi.advanceTimersByTime(60_000);
    expect(await cached()).toBe("v2");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
