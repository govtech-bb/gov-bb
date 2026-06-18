/**
 * Data model for the preview commenting widget.
 *
 * A `Thread` is one comment pinned to a place on the page, plus any `Reply`s.
 * Anchoring is dual (resolved most-specific-first):
 *   - `selector` — a CSS path to the element the comment was attached to. Drives
 *     the floating pin's position. Always present.
 *   - `quote`/`prefix`/`suffix` — present only when the reviewer had text
 *     selected. Lets the widget also draw an inline highlight over that text
 *     (W3C text-quote style), and survives small DOM shifts the selector can't.
 */
export interface Reply {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export interface Thread {
  id: string;
  /** Identifies the page the thread belongs to (e.g. the pathname). */
  pageId: string;
  /** CSS selector for the anchored element. */
  selector: string;
  /** Selected text, if any. Empty string when the reviewer pinned an element. */
  quote: string;
  /** Up to ~32 chars of text before the quote, to disambiguate repeats. */
  prefix: string;
  /** Up to ~32 chars of text after the quote. */
  suffix: string;
  author: string;
  text: string;
  createdAt: number;
  resolved: boolean;
  replies: Reply[];
}

/**
 * Storage seam. The widget never talks to a backend directly — it goes through
 * a transport, so the same widget runs against localStorage today and a real
 * API later (a separate PR) just by swapping the implementation. Every method
 * is async (Promise-based) so the API-backed transport drops in unchanged.
 */
export interface CommentTransport {
  /** All threads for one page, oldest first. */
  list(pageId: string): Promise<Thread[]>;
  /** Every thread across all pages — powers the cross-page sidebar. */
  listAll(): Promise<Thread[]>;
  /** Persist a new thread; resolves with the stored thread. */
  create(thread: Thread): Promise<Thread>;
  /** Append a reply to an existing thread. */
  reply(threadId: string, reply: Reply): Promise<Reply>;
  /** Toggle a thread's resolved state. */
  setResolved(threadId: string, resolved: boolean): Promise<void>;
}

export interface MountOptions {
  /**
   * Only text inside this element is commentable, and pins are positioned
   * relative to it. A CSS selector; defaults to `#main`.
   */
  root?: string;
  /** Identifies the current page for storage. Defaults to `location.pathname`. */
  pageId?: string;
  /** Storage backend. Defaults to a localStorage-backed transport. */
  transport?: CommentTransport;
}
