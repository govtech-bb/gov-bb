import type { UIMessage } from "@tanstack/ai";
import type { Citation } from "#/lib/chat/types";

// sessionStorage, not localStorage: the chat may run on shared/public
// machines, so history must not outlive the tab.
const STORAGE_PREFIX = "alpha-chat:";

// Adapter errors are swallowed by the ChatClient persistor (persistence is
// best-effort), so no try/catch here.
export const chatPersistence = {
  // Async so hydration lands after React's hydration render — a sync getItem
  // would make the client's first render differ from the SSR'd empty chat.
  async getItem(id: string): Promise<Array<UIMessage> | null> {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const messages = JSON.parse(raw) as Array<UIMessage>;
    // createdAt is a Date on UIMessage but a string after the JSON round-trip.
    return messages.map((m) =>
      m.createdAt ? { ...m, createdAt: new Date(m.createdAt) } : m,
    );
  },
  setItem(id: string, messages: Array<UIMessage>): void {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(messages));
  },
  removeItem(id: string): void {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(STORAGE_PREFIX + id);
  },
};

// Citations arrive as custom events keyed by assistant messageId and live in
// React state, not on the messages — persist them alongside so restored
// answers keep their citation footnotes.
const CITATIONS_KEY = `${STORAGE_PREFIX}citations`;

export const citationsStore = {
  load(): Record<string, Citation[]> {
    if (typeof sessionStorage === "undefined") return {};
    try {
      const raw = sessionStorage.getItem(CITATIONS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Citation[]>) : {};
    } catch {
      return {};
    }
  },
  save(citations: Record<string, Citation[]>): void {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(CITATIONS_KEY, JSON.stringify(citations));
    } catch {
      // best-effort, like the message persistence
    }
  },
};

// Beta notice "shown once per session" flag. sessionStorage (not localStorage)
// so the friendly heads-up returns in a fresh tab/session but stays dismissed
// across refreshes and "Start again" within the same session.
const BETA_NOTICE_KEY = `${STORAGE_PREFIX}beta-dismissed`;

export const betaNoticeStore = {
  isDismissed(): boolean {
    if (typeof sessionStorage === "undefined") return false;
    try {
      return sessionStorage.getItem(BETA_NOTICE_KEY) === "1";
    } catch {
      return false;
    }
  },
  dismiss(): void {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(BETA_NOTICE_KEY, "1");
    } catch {
      // best-effort, like the message persistence
    }
  },
};

// Keep the threadId stable across refreshes too — the server's in-memory form
// session is keyed by it, so a mid-form conversation restored from storage
// would otherwise lose its form state.
export function getSessionThreadId(): string | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  const key = `${STORAGE_PREFIX}thread-id`;
  let threadId = sessionStorage.getItem(key);
  if (!threadId) {
    threadId = crypto.randomUUID();
    sessionStorage.setItem(key, threadId);
  }
  return threadId;
}

// "Start again" rotates the threadId: the orphaned server-side form session
// becomes unreachable and TTL-sweeps, instead of leaking into the new chat.
export function resetSessionThreadId(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(`${STORAGE_PREFIX}thread-id`);
}
