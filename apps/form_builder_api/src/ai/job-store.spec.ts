import {
  createJobStore,
  toStatusResponse,
  ONE_HOUR_MS,
  SWEEP_INTERVAL_MS,
  DEFAULT_MAX_SIZE,
} from "./job-store";

describe("createJobStore", () => {
  it("get returns the state that was set", () => {
    const store = createJobStore<number>();
    store.set("a", { kind: "running", startedAt: 1 });
    expect(store.get("a")).toEqual({ kind: "running", startedAt: 1 });
  });

  it("get returns undefined for an unknown id", () => {
    const store = createJobStore<number>();
    expect(store.get("missing")).toBeUndefined();
  });

  it("keeps independent key namespaces per instance", () => {
    const a = createJobStore<number>();
    const b = createJobStore<number>();
    a.set("k", { kind: "running", startedAt: 1 });
    expect(b.get("k")).toBeUndefined();
  });

  describe("sweep", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("evicts entries older than one hour and fires onEvict for each", () => {
      const evicted: string[] = [];
      const store = createJobStore<number>({
        onEvict: (key) => evicted.push(key),
      });
      store.set("old", { kind: "done", result: 1, finishedAt: Date.now() });

      vi.advanceTimersByTime(ONE_HOUR_MS + SWEEP_INTERVAL_MS);

      expect(store.get("old")).toBeUndefined();
      expect(evicted).toEqual(["old"]);
    });

    it("keeps entries younger than one hour", () => {
      const store = createJobStore<number>();
      // Move the clock forward so the entry's timestamp is well past 0 but the
      // entry itself is fresh relative to the next sweep.
      vi.advanceTimersByTime(2 * ONE_HOUR_MS);
      const startedAt = Date.now();
      store.set("fresh", { kind: "running", startedAt });

      vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

      expect(store.get("fresh")).toEqual({ kind: "running", startedAt });
    });
  });

  describe("max size cap", () => {
    it("exposes a default cap of 500", () => {
      expect(DEFAULT_MAX_SIZE).toBe(500);
    });

    it("evicts the oldest entry by insertion order when at cap", () => {
      const evicted: string[] = [];
      const store = createJobStore<number>({
        maxSize: 3,
        onEvict: (k) => evicted.push(k),
      });

      store.set("a", { kind: "running", startedAt: 1 });
      store.set("b", { kind: "running", startedAt: 2 });
      store.set("c", { kind: "running", startedAt: 3 });
      // Adding a 4th distinct key forces eviction of "a" (oldest insertion).
      store.set("d", { kind: "running", startedAt: 4 });

      expect(store.get("a")).toBeUndefined();
      expect(store.get("b")).toBeDefined();
      expect(store.get("c")).toBeDefined();
      expect(store.get("d")).toBeDefined();
      expect(evicted).toEqual(["a"]);
    });

    it("updating an existing key does not count against the cap", () => {
      const evicted: string[] = [];
      const store = createJobStore<number>({
        maxSize: 2,
        onEvict: (k) => evicted.push(k),
      });

      store.set("a", { kind: "running", startedAt: 1 });
      store.set("b", { kind: "running", startedAt: 2 });
      // running → done is a state transition on an existing key — must not
      // evict "b" just because we're at cap.
      store.set("a", { kind: "done", result: 1, finishedAt: 3 });

      expect(store.get("a")).toEqual({
        kind: "done",
        result: 1,
        finishedAt: 3,
      });
      expect(store.get("b")).toBeDefined();
      expect(evicted).toEqual([]);
    });
  });
});

describe("toStatusResponse", () => {
  it("maps running to generating", () => {
    expect(toStatusResponse({ kind: "running", startedAt: 1 })).toEqual({
      status: "generating",
    });
  });

  it("maps done to status done spread with the result fields", () => {
    const result = { recipe: { a: 1 }, reply: "hi", unresolvableRefs: [] };
    expect(toStatusResponse({ kind: "done", result, finishedAt: 1 })).toEqual({
      status: "done",
      recipe: { a: 1 },
      reply: "hi",
      unresolvableRefs: [],
    });
  });

  it("maps failed to status failed with the reason", () => {
    expect(
      toStatusResponse({ kind: "failed", reason: "boom", finishedAt: 1 }),
    ).toEqual({ status: "failed", reason: "boom" });
  });
});
