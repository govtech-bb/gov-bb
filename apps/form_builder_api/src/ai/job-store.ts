// Shared in-memory job-store for the async AI pipelines (text edits in ai.ts,
// PDF uploads in ai-upload.ts). Both keep per-job Bedrock state in a Map keyed
// by jobId with identical machinery — this module is the single place to reason
// about job lifetime and status shape (#1145).
//
// We track this in memory because the form_builder_api runs a single ECS task
// in sandbox/staging, so no cross-task coordination is needed. State is meant
// to be ephemeral — the sweep below caps memory. Each route owns its own store
// instance (independent Map, independent sweep, no shared key namespace).

// A job's lifecycle: it starts running, then settles to done (with a result)
// or failed (with a reason). Generic over the result payload T.
export type JobState<T> =
  | { kind: "running"; startedAt: number }
  | { kind: "done"; result: T; finishedAt: number }
  | { kind: "failed"; reason: string; finishedAt: number };

// Sweep entries older than 1 hour, every 5 minutes.
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Defence-in-depth cap on entries per store. The TTL sweep is the primary
// guard, but a sustained burst of jobs in <1 hour could otherwise grow the
// Map unbounded. At ~5KB per entry, 500 entries ≈ 2.5MB — comfortably below
// the task's memory budget, but large enough that legitimate bursts don't
// trip the cap. Eviction is FIFO by insertion order (#291).
export const DEFAULT_MAX_SIZE = 500;

export interface JobStore<T> {
  get(jobId: string): JobState<T> | undefined;
  set(jobId: string, state: JobState<T>): void;
}

// Creates an isolated job-store: a private Map plus its own periodic sweep that
// evicts entries older than ONE_HOUR_MS, with a hard FIFO cap of `maxSize`
// entries. `onEvict(key)` fires once per evicted entry (TTL sweep OR cap
// eviction) — ai-upload.ts uses it to drop the orphan context entry in
// lockstep with its job entry.
export function createJobStore<T>(opts?: {
  onEvict?: (key: string) => void;
  maxSize?: number;
}): JobStore<T> {
  const stateByJobId = new Map<string, JobState<T>>();
  const maxSize = opts?.maxSize ?? DEFAULT_MAX_SIZE;

  setInterval(() => {
    const cutoff = Date.now() - ONE_HOUR_MS;
    for (const [k, v] of stateByJobId) {
      const ts = "startedAt" in v ? v.startedAt : v.finishedAt;
      if (ts < cutoff) {
        stateByJobId.delete(k);
        opts?.onEvict?.(k);
      }
    }
  }, SWEEP_INTERVAL_MS).unref(); // unref so the interval doesn't keep the process alive

  return {
    get: (jobId) => stateByJobId.get(jobId),
    set: (jobId, state) => {
      // Cap only counts NEW keys — updating an existing entry's state (e.g.
      // running → done) keeps it in place. When adding a new key would exceed
      // the cap, evict the oldest entry by insertion order (Map preserves it).
      if (!stateByJobId.has(jobId) && stateByJobId.size >= maxSize) {
        const oldest = stateByJobId.keys().next().value;
        if (oldest !== undefined) {
          stateByJobId.delete(oldest);
          opts?.onEvict?.(oldest);
        }
      }
      stateByJobId.set(jobId, state);
    },
  };
}

// Maps a settled-or-running job state to its HTTP status-response body:
//   running → { status: "generating" }
//   done    → { status: "done", ...result }
//   failed  → { status: "failed", reason }
// The unknown-id 404 is not handled here — that's a `state === undefined`
// branch each handler keeps.
export function toStatusResponse<T>(
  state: JobState<T>,
): Record<string, unknown> {
  if (state.kind === "running") {
    return { status: "generating" };
  }
  if (state.kind === "done") {
    return { status: "done", ...state.result };
  }
  return { status: "failed", reason: state.reason };
}
