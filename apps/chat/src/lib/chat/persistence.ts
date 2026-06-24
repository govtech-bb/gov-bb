import type { UIMessage } from "@tanstack/ai";
import type { Citation } from "#/lib/rag/types";
import type { LinkTokenMap } from "#/lib/chat/link-tokens";

// sessionStorage-backed chat persistence. There is exactly one conversation
// (useChat id="conversation"), so the id is folded into a single key instead of
// being namespaced per-thread — multiple saved threads aren't supported. Every
// adapter call is best-effort: a full or unavailable store must never break the
// chat.

const MESSAGES_KEY = "gov-chat:conversation";
const CITATIONS_KEY = "gov-chat:citations";

const hasWindow = () => typeof window !== "undefined";

// Structurally a `ChatClientPersistence` (get/set/remove by id) — typed via
// UIMessage rather than naming the interface, which lives in @tanstack/ai-client
// (not a direct dep); the typed `persistence` option validates the shape.
export const conversationPersistence = {
  getItem: (_id: string): Array<UIMessage> | null => {
    if (!hasWindow()) return null;
    try {
      const raw = window.sessionStorage.getItem(MESSAGES_KEY);
      if (!raw) return null;
      // createdAt is a Date that JSON.stringify turned into a string — revive it.
      return (JSON.parse(raw) as Array<UIMessage>).map((m) => ({
        ...m,
        createdAt:
          typeof m.createdAt === "string" ? new Date(m.createdAt) : m.createdAt,
      }));
    } catch {
      return null;
    }
  },
  setItem: (_id: string, messages: Array<UIMessage>): void => {
    if (!hasWindow()) return;
    try {
      window.sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      // best-effort
    }
  },
  removeItem: (_id: string): void => {
    if (!hasWindow()) return;
    try {
      window.sessionStorage.removeItem(MESSAGES_KEY);
      window.sessionStorage.removeItem(CITATIONS_KEY);
    } catch {
      // best-effort
    }
  },
};

// Citations + link tokens arrive as a CUSTOM event and live in React state keyed
// by messageId — separate from the persisted UIMessages. Persist them alongside
// so a restored assistant reply keeps its Sources badges and restored links;
// otherwise a reload would drop the [N] sources and leave raw link_N tokens in
// the text.
export interface CitationSidecar {
  citations: Record<string, Citation[]>;
  linkTokens: Record<string, LinkTokenMap>;
}

const EMPTY_SIDECAR: CitationSidecar = {
  citations: {},
  linkTokens: {},
};

export function loadCitationSidecar(): CitationSidecar {
  if (!hasWindow()) return EMPTY_SIDECAR;
  try {
    const raw = window.sessionStorage.getItem(CITATIONS_KEY);
    if (!raw) return EMPTY_SIDECAR;
    const parsed = JSON.parse(raw) as Partial<CitationSidecar>;
    return {
      citations: parsed.citations ?? {},
      linkTokens: parsed.linkTokens ?? {},
    };
  } catch {
    return EMPTY_SIDECAR;
  }
}

export function saveCitationSidecar(sidecar: CitationSidecar): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(CITATIONS_KEY, JSON.stringify(sidecar));
  } catch {
    // best-effort
  }
}
