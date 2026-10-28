import type { EditorApi } from "../../src/api/client";
import {
  pageEditActivitySequenceSchema,
  pageEditLockGenerationSchema,
  pageEditLockStatusSchema,
  type PageEditLockToken,
  type PageApiFailure,
  type PageApiResult,
  type PageEditActivitySequence,
  type PageEditLockApi,
  type PageEditLockGeneration,
  type PageEditLockStatus,
} from "../../src/api/page-schemas";
import type { PageEditLockRuntime } from "../../src/workspace/page-edit-lock-session";

/** Faithful single-employee lock protocol: each acquisition, including another tab, has its own credential. */
export class InMemoryPageEditLocks implements PageEditLockApi {
  /** Public generation survives releases, as it does in PostgreSQL. */
  generation = pageEditLockGenerationSchema.parse(0);
  /** One page's current grant; tests may inspect it independently of the client state. */
  claim?: {
    token: PageEditLockToken;
    expiresMs: number;
    activityMs: number;
    sequence: PageEditActivitySequence;
  };
  /** Recorded calls retain redacted credentials for ordering and cleanup assertions. */
  readonly requests: { method: string; token?: PageEditLockToken }[] = [];
  /** Delay acknowledgement after an acquisition commits. */
  acquireResponse?: Promise<void>;
  /** Delay acknowledgement after a renewal commits. */
  renewResponse?: Promise<void>;
  /** Refuse requests without changing server state while a simulated outage is active. */
  failure?: PageApiFailure;
  /** Tests own time; constructing the service acquires no resources. */
  constructor(private readonly clock: Pick<PageEditLockRuntime, "nowMs">) {}
  private status(token?: PageEditLockToken): PageEditLockStatus {
    const now = this.clock.nowMs();
    const common = { lockGeneration: this.generation, serverTime: new Date(now).toISOString() };
    const claim = this.claim;

    return pageEditLockStatusSchema.parse(
      !claim || now >= claim.expiresMs
        ? { ...common, state: "unheld" }
        : {
            ...common,
            state: "held",
            holderName: "Another editor",
            ownedByCaller: token?.reveal() === claim.token.reveal(),
            lockExpiresAt: new Date(claim.expiresMs).toISOString(),
            lastActivityAt: new Date(claim.activityMs).toISOString(),
            idlePromptAt: new Date(claim.activityMs + 600_000).toISOString(),
            idleExpiresAt: new Date(claim.activityMs + 720_000).toISOString(),
            activitySequence: claim.sequence,
          },
    );
  }
  /** Presence does not renew the grant or advance activity. */
  async readPageEditLock(
    _id: string,
    token?: PageEditLockToken,
  ): Promise<PageApiResult<PageEditLockStatus>> {
    this.requests.push({ method: "read", token });

    return this.failure
      ? { ok: false, error: this.failure }
      : { ok: true, value: this.status(token) };
  }
  /** Compare the caller's generation before replacing a claim. */
  async acquirePageEditLock(
    pageId: string,
    token: PageEditLockToken,
    command: { action: "acquire" | "takeover"; expectedLockGeneration: PageEditLockGeneration },
  ): Promise<PageApiResult<PageEditLockStatus>> {
    this.requests.push({ method: "acquire", token });

    if (this.failure) return { ok: false, error: this.failure };
    const status = this.status(token);

    if (status.state === "held" && status.ownedByCaller) return { ok: true, value: status };

    if (
      command.expectedLockGeneration !== this.generation ||
      (command.action === "acquire" && status.state === "held")
    )
      return { ok: false, error: { kind: "lock-conflict", pageId } };
    this.generation = pageEditLockGenerationSchema.parse(this.generation + 1);
    this.claim = {
      token,
      expiresMs: this.clock.nowMs() + 120_000,
      activityMs: this.clock.nowMs(),
      sequence: pageEditActivitySequenceSchema.parse(0),
    };
    const response = this.status(token);
    await this.acquireResponse;

    return { ok: true, value: response };
  }
  /** Only new activity extends the idle window of a live matching grant. */
  async renewPageEditLock(
    pageId: string,
    token: PageEditLockToken,
    sequence: PageEditActivitySequence,
  ): Promise<PageApiResult<PageEditLockStatus>> {
    this.requests.push({ method: "renew", token });

    if (this.failure) return { ok: false, error: this.failure };
    const status = this.status(token);

    if (!this.claim || status.state !== "held" || !status.ownedByCaller)
      return { ok: false, error: { kind: "lock-lost", pageId } };

    if (sequence > this.claim.sequence) {
      this.claim.activityMs = this.clock.nowMs();
      this.claim.sequence = sequence;
    }

    this.claim.expiresMs = Math.min(this.clock.nowMs() + 120_000, this.claim.activityMs + 720_000);
    const response = this.status(token);
    await this.renewResponse;

    return { ok: true, value: response };
  }
  /** Stale tokens cannot release a replacement grant. */
  async releasePageEditLock(_id: string, token: PageEditLockToken): Promise<PageApiResult<void>> {
    this.requests.push({ method: "release", token });

    if (this.failure) return { ok: false, error: this.failure };

    if (this.claim?.token.reveal() === token.reveal()) this.claim = undefined;

    return { ok: true, value: undefined };
  }
}

type PageEditLockTestContext = {
  readonly locks: Map<string, InMemoryPageEditLocks>;
  readonly api: EditorApi;
};

/** Compose the real content client with an isolated, faithful lock service for DOM tests. */
export function withInMemoryPageEditLocks(
  api: EditorApi,
  clock: Pick<PageEditLockRuntime, "nowMs">,
): PageEditLockTestContext {
  const locks = new Map<string, InMemoryPageEditLocks>();

  const forPage = (id: string) => {
    let service = locks.get(id);

    if (!service) {
      service = new InMemoryPageEditLocks(clock);
      locks.set(id, service);
    }

    return service;
  };

  return {
    locks,
    api: {
      ...api,
      readPageEditLock: (id, token) => forPage(id).readPageEditLock(id, token),
      acquirePageEditLock: (id, token, command) =>
        forPage(id).acquirePageEditLock(id, token, command),
      renewPageEditLock: (id, token, sequence) =>
        forPage(id).renewPageEditLock(id, token, sequence),
      releasePageEditLock: (id, token) => forPage(id).releasePageEditLock(id, token),
    } satisfies EditorApi,
  };
}
