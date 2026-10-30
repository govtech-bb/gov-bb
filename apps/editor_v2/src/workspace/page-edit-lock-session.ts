import {
  pageEditActivitySequenceSchema,
  type PageApiFailure,
  type PageApiResult,
  type PageEditActivitySequence,
  type PageEditLockApi,
  type PageEditLockGeneration,
  type PageEditLockStatus,
  type PageEditLockToken,
} from "../api/page-schemas";

/** A scheduler delay in milliseconds, not an absolute server deadline. */
export type PageEditLockDelayMs = number & { readonly PageEditLockDelayMs: unique symbol };

function makePageEditLockDelayMs(value: number): PageEditLockDelayMs {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid page edit lock timer delay");

  // SAFETY: The finite nonnegative check establishes the private unit brand, which TypeScript cannot infer.
  return value as PageEditLockDelayMs;
}

const HEARTBEAT_INTERVAL_MS = makePageEditLockDelayMs(30_000);

type HeldPageEditLock = Extract<PageEditLockStatus, { state: "held" }>;

/** Editing authority is withheld while checking ownership, after expiry, and while answering the idle prompt. */
export type PageEditLockState =
  | { readonly kind: "inactive" | "acquiring-lock" }
  | { readonly kind: "editable"; readonly status: HeldPageEditLock }
  | {
      readonly kind: "awaiting-idle-response";
      readonly status: HeldPageEditLock;
      readonly responding: boolean;
    }
  | { readonly kind: "locked-by-another-session"; readonly status: HeldPageEditLock }
  | { readonly kind: "lock-lost"; readonly reason: "expired" | "released" | "replaced" }
  | { readonly kind: "lock-unconfirmed"; readonly failure?: PageApiFailure };

/** Browser resource capabilities; construction itself starts no timers or requests. */
export interface PageEditLockRuntime {
  /** Local time is used only to conservatively project the server's deadlines. */
  nowMs(): number;
  /** Return a cancellation function for this one timer. */
  schedule(delayMs: PageEditLockDelayMs, task: () => void): () => void;
  /** Produce a fresh random credential for each acquisition, never a login-session token. */
  newToken(): PageEditLockToken;
}

type Acquisition = {
  readonly editLockToken: PageEditLockToken;
  activitySequence: PageEditActivitySequence;
  inFlight: boolean;
  reconcileRequested: boolean;
  renewRequested: boolean;
  grant?: { lockExpiresAtMs: number; idlePromptAtMs: number; idleExpiresAtMs: number };
};

/** Active-page ownership controls; state updates report async results without owning page content. */
export interface IPageEditLockSession {
  getSnapshot(): PageEditLockState;
  subscribe(listener: () => void): () => void;
  activate(): void;
  deactivate(): void;
  startEditing(): void;
  takeOver(expectedLockGeneration: PageEditLockGeneration): void;
  reconcile(): void;
  markUnconfirmed(failure: PageApiFailure): void;
  recordActivity(): void;
  continueEditing(): void;
  stopEditing(): void;
  getEditLockToken(): PageEditLockToken | undefined;
}

/** Owns one active page's edit lock, including timers and late-response compensation, never its working copy. */
export class PageEditLockSession implements IPageEditLockSession {
  private state: PageEditLockState = { kind: "inactive" };
  private acquisition: Acquisition | undefined;
  private cancelTimer: (() => void) | undefined;
  private listeners = new Set<() => void>();

  /** Bind one page and its capabilities; acquisition starts only with activate. */
  constructor(
    private readonly pageId: string,
    private readonly api: PageEditLockApi,
    private readonly runtime: PageEditLockRuntime,
  ) {}

  /** Snapshot identity changes only when ownership or its server deadlines change. */
  getSnapshot = (): PageEditLockState => this.state;

  /** Observers do not acquire ownership; only the active pane calls activate. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Acquire for an active authorized page, after observing the current generation. */
  activate = (): void => {
    if (!this.acquisition) this.beginAcquisition();
  };

  /** Release only after confirmed departure; cancelled navigation must not call this. */
  deactivate = (): void => {
    this.abandonAcquisition();
    this.publish({ kind: "inactive" });
  };

  /** Explicitly resume after loss; failed/uncertain claims must first be reconciled. */
  startEditing = (): void => {
    if (this.state.kind === "lock-unconfirmed") {
      this.reconcile();

      return;
    }

    if (this.state.kind === "lock-lost") this.beginAcquisition();
  };

  /** Take over exactly the holder generation reviewed in the confirmation dialog. */
  takeOver = (expectedLockGeneration: PageEditLockGeneration): void => {
    if (this.state.kind === "locked-by-another-session")
      this.beginAcquisition(expectedLockGeneration);
  };

  /** Presence reads on resume do not count as editing or extend expiry. */
  reconcile = (): void => {
    const acquisition = this.acquisition;

    if (!acquisition) return;
    this.publish({ kind: "lock-unconfirmed" });
    acquisition.reconcileRequested = true;
    this.drainRequests(acquisition);
  };

  /** A read/write outage withholds authority until a subsequent GET confirms the exact claim. */
  markUnconfirmed = (failure: PageApiFailure): void => {
    if (!this.acquisition) return;
    this.acquisition.grant = undefined;
    this.acquisition.reconcileRequested = true;
    this.publish({ kind: "lock-unconfirmed", failure });
    this.drainRequests(this.acquisition);
  };

  /** Count actual source, canvas or metadata changes; focus, pointer movement and heartbeats never call this. */
  recordActivity = (): void => {
    if (!this.getEditLockToken() || !this.acquisition) return;
    this.acquisition.activitySequence = pageEditActivitySequenceSchema.parse(
      this.acquisition.activitySequence + 1,
    );
  };

  /** Explicit idle response counts as activity, but cannot renew an already expired claim. */
  continueEditing = (): void => {
    const acquisition = this.acquisition;

    if (
      !acquisition ||
      this.state.kind !== "awaiting-idle-response" ||
      this.expireIfNeeded(acquisition)
    )
      return;
    acquisition.activitySequence = pageEditActivitySequenceSchema.parse(
      acquisition.activitySequence + 1,
    );
    acquisition.renewRequested = true;
    this.publish({ ...this.state, responding: true });
    this.drainRequests(acquisition);
  };

  /** Stop editing without closing or replacing the open working copy. */
  stopEditing = (): void => {
    this.abandonAcquisition();
    this.publish({ kind: "lock-lost", reason: "released" });
  };

  /** A UI render is not proof of liveness: check the projected deadline again at the actual write. */
  getEditLockToken = (): PageEditLockToken | undefined => {
    const acquisition = this.acquisition;

    if (this.state.kind !== "editable" || !acquisition?.grant) return;

    if (
      this.runtime.nowMs() >= acquisition.grant.lockExpiresAtMs ||
      this.runtime.nowMs() >= acquisition.grant.idlePromptAtMs
    )
      return;

    return acquisition.editLockToken;
  };

  private publish(state: PageEditLockState) {
    this.state = state;

    for (const listener of this.listeners) listener();
  }

  private beginAcquisition(takeoverGeneration?: PageEditLockGeneration) {
    this.abandonAcquisition();

    const acquisition: Acquisition = {
      editLockToken: this.runtime.newToken(),
      activitySequence: pageEditActivitySequenceSchema.parse(0),
      inFlight: false,
      reconcileRequested: false,
      renewRequested: false,
    };

    this.acquisition = acquisition;
    this.publish({ kind: "acquiring-lock" });
    this.request(acquisition, async () => {
      const readStartedAtMs = this.runtime.nowMs();
      const read = await this.api.readPageEditLock(this.pageId, acquisition.editLockToken);

      if (this.acquisition !== acquisition) return;

      if (
        !read.ok ||
        (read.value.state === "held" &&
          (read.value.ownedByCaller || takeoverGeneration === undefined))
      ) {
        this.accept(acquisition, read, readStartedAtMs);

        return;
      }

      // Do not replace a reviewed takeover generation with the latest holder from this read.
      const startedAtMs = this.runtime.nowMs();

      const result = await this.api.acquirePageEditLock(this.pageId, acquisition.editLockToken, {
        action: takeoverGeneration === undefined ? "acquire" : "takeover",
        expectedLockGeneration: takeoverGeneration ?? read.value.lockGeneration,
      });

      this.accept(acquisition, result, startedAtMs);
    });
  }

  private abandonAcquisition() {
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    const acquisition = this.acquisition;
    this.acquisition = undefined;

    // Cancellation is not rollback. An in-flight claim is released by request's finally after it settles.
    if (acquisition && !acquisition.inFlight)
      void this.api.releasePageEditLock(this.pageId, acquisition.editLockToken);
  }

  private request(acquisition: Acquisition, operation: () => Promise<void>) {
    acquisition.inFlight = true;
    void operation().finally(() => {
      acquisition.inFlight = false;

      if (this.acquisition !== acquisition) {
        void this.api.releasePageEditLock(this.pageId, acquisition.editLockToken);

        return;
      }

      this.drainRequests(acquisition);
      this.armTimer(acquisition);
    });
    this.armTimer(acquisition);
  }

  private drainRequests(acquisition: Acquisition) {
    if (this.acquisition !== acquisition || acquisition.inFlight) return;

    if (acquisition.reconcileRequested) {
      acquisition.reconcileRequested = false;
      this.request(acquisition, async () => {
        const startedAtMs = this.runtime.nowMs();
        this.accept(
          acquisition,
          await this.api.readPageEditLock(this.pageId, acquisition.editLockToken),
          startedAtMs,
        );
      });
    } else if (acquisition.renewRequested && acquisition.grant) {
      acquisition.renewRequested = false;
      this.request(acquisition, async () => {
        const startedAtMs = this.runtime.nowMs();
        this.accept(
          acquisition,
          await this.api.renewPageEditLock(
            this.pageId,
            acquisition.editLockToken,
            acquisition.activitySequence,
          ),
          startedAtMs,
        );
      });
    }
  }

  private accept(
    acquisition: Acquisition,
    result: PageApiResult<PageEditLockStatus>,
    startedAtMs: number,
  ) {
    if (this.acquisition !== acquisition || acquisition.reconcileRequested) return;

    if (!result.ok) {
      acquisition.grant = undefined;
      acquisition.renewRequested = false;
      const failure = result.error;

      if (failure.kind === "lock-lost" || failure.kind === "lock-required")
        this.publish({ kind: "lock-lost", reason: "replaced" });
      else this.publish({ kind: "lock-unconfirmed", failure });

      if (failure.kind === "lock-conflict") acquisition.reconcileRequested = true;

      return;
    }

    const status = result.value;

    if (status.state === "unheld" || !status.ownedByCaller) {
      acquisition.grant = undefined;
      acquisition.renewRequested = false;
      this.publish(
        status.state === "held"
          ? { kind: "locked-by-another-session", status }
          : { kind: "lock-lost", reason: "released" },
      );

      return;
    }

    acquisition.activitySequence =
      status.activitySequence > acquisition.activitySequence
        ? status.activitySequence
        : acquisition.activitySequence;
    const serverTimeMs = Date.parse(status.serverTime);
    // Anchor at request start, not response arrival: a delayed reply never grants extra local editing time.
    acquisition.grant = {
      lockExpiresAtMs: startedAtMs + Date.parse(status.lockExpiresAt) - serverTimeMs,
      idlePromptAtMs: startedAtMs + Date.parse(status.idlePromptAt) - serverTimeMs,
      idleExpiresAtMs: startedAtMs + Date.parse(status.idleExpiresAt) - serverTimeMs,
    };

    if (this.expireIfNeeded(acquisition)) return;
    this.publish(
      this.runtime.nowMs() >= acquisition.grant.idlePromptAtMs
        ? {
            kind: "awaiting-idle-response",
            status,
            responding: acquisition.activitySequence > status.activitySequence,
          }
        : { kind: "editable", status },
    );
  }

  private expireIfNeeded(acquisition: Acquisition) {
    const grant = acquisition.grant;

    if (!grant || this.runtime.nowMs() < Math.min(grant.lockExpiresAtMs, grant.idleExpiresAtMs))
      return false;
    this.abandonAcquisition();
    this.publish({ kind: "lock-lost", reason: "expired" });

    return true;
  }

  private armTimer(acquisition: Acquisition) {
    this.cancelTimer?.();

    if (this.acquisition !== acquisition) return;
    const grant = acquisition.grant;
    const nowMs = this.runtime.nowMs();

    const nextDeadlineMs = grant
      ? Math.min(
          grant.lockExpiresAtMs,
          grant.idleExpiresAtMs,
          this.state.kind === "editable" ? grant.idlePromptAtMs : Infinity,
        )
      : Infinity;

    const delayMs = makePageEditLockDelayMs(
      Math.max(0, Math.min(HEARTBEAT_INTERVAL_MS, nextDeadlineMs - nowMs)),
    );

    this.cancelTimer = this.runtime.schedule(delayMs, () => {
      if (this.acquisition !== acquisition || this.expireIfNeeded(acquisition)) return;

      if (grant && this.state.kind === "editable" && this.runtime.nowMs() >= grant.idlePromptAtMs) {
        this.publish({
          kind: "awaiting-idle-response",
          status: this.state.status,
          responding: false,
        });
      }

      if (this.state.kind === "editable" || this.state.kind === "awaiting-idle-response")
        acquisition.renewRequested = true;
      else acquisition.reconcileRequested = true;
      this.drainRequests(acquisition);
      this.armTimer(acquisition);
    });
  }
}
