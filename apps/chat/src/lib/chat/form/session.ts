import { randomUUID } from "node:crypto";

type FormSessionStatus = "collecting" | "submitting" | "submitted" | "failed";

export interface FormSession {
  threadId: string;
  slug: string | null;
  handedOffSlug: string | null;
  values: Record<string, string>;
  // Fields already presented to the user (ask_field served them). Drives the
  // ask cursor: asked-but-uncollected means the user skipped an optional
  // field, so the cursor advances instead of re-asking.
  askedFieldIds: Set<string>;
  // False whenever a value changes after the last review_form — submit_form
  // refuses until the user has seen a review of what will actually be sent.
  reviewedSinceChange: boolean;
  // A RAG-driven form offer awaiting the user's choice (fill here vs link).
  // Set by funnel.offerForm, consumed (or lapsed) on the very next turn.
  offeredForm?: { slug: string; title: string };
  submissionId: string;
  status: FormSessionStatus;
  referenceNumber?: string;
  lastError?: string;
  // True once the model has offered in-chat feedback this session, so the
  // offer is never made twice. Deliberately NOT cleared by
  // resetSessionForNewForm — it must survive switching to the feedback form.
  feedbackOffered?: boolean;
  // Consecutive retrieval-miss turns (zero grounded context). We clarify ONCE
  // on the first miss, then disclose we can't help instead of re-asking turn
  // over turn (#1176). Incremented on each miss, reset to 0 by any non-miss
  // turn via funnel.recordMissOutcome.
  consecutiveMisses?: number;
  createdAt: number;
  updatedAt: number;
}

const SESSION_TTL_MS = 30 * 60_000; // 30 min idle
const MAX_SESSIONS = 5_000;
const sessions = new Map<string, FormSession>();
const locks = new Map<string, Promise<unknown>>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
  if (sessions.size > MAX_SESSIONS) {
    const entries = [...sessions.entries()].sort(
      (a, b) => a[1].updatedAt - b[1].updatedAt,
    );
    for (const [id] of entries.slice(0, sessions.size - MAX_SESSIONS)) {
      sessions.delete(id);
    }
  }
}

export function getOrCreateSession(threadId: string): FormSession {
  sweepExpired();
  let s = sessions.get(threadId);
  if (!s) {
    const now = Date.now();
    s = {
      threadId,
      slug: null,
      handedOffSlug: null,
      values: {},
      askedFieldIds: new Set(),
      reviewedSinceChange: false,
      submissionId: randomUUID(),
      status: "collecting",
      createdAt: now,
      updatedAt: now,
    };
    sessions.set(threadId, s);
  } else {
    s.updatedAt = Date.now();
  }
  return s;
}

export function resetSessionForNewForm(session: FormSession): void {
  session.slug = null;
  session.handedOffSlug = null;
  session.values = {};
  session.askedFieldIds = new Set();
  session.reviewedSinceChange = false;
  session.offeredForm = undefined;
  session.submissionId = randomUUID();
  session.status = "collecting";
  session.referenceNumber = undefined;
  session.lastError = undefined;
  session.consecutiveMisses = 0;
  session.updatedAt = Date.now();
}

// Serialize concurrent runTurn calls per threadId. Returned promise resolves
// with the task's return value once any earlier task on this threadId is done.
export function withThreadLock<T>(
  threadId: string,
  task: () => Promise<T>,
): Promise<T> {
  const prior = locks.get(threadId) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(task);
  const guard: Promise<unknown> = next.finally(() => {
    // Only evict if a newer task hasn't replaced us. Compare against the SAME
    // promise we stored: the prior code compared against `next` (the pre-
    // `.finally` promise), which never matched, so entries were never deleted
    // and `locks` grew unbounded (no TTL/cap, unlike `sessions`).
    if (locks.get(threadId) === guard) locks.delete(threadId);
  });
  locks.set(threadId, guard);
  return next;
}
