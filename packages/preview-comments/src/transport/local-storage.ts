import type { CommentTransport, Reply, Thread } from "../types";

/**
 * Per-browser comment store. Comments live in the reviewer's own localStorage,
 * so they are NOT shared between people — this is the phase-1 transport while
 * the backend API is built in a separate PR. Keyed per page so each page keeps
 * its own threads.
 */
export class LocalStorageTransport implements CommentTransport {
  private keyFor(pageId: string): string {
    return `gtc:preview-comments:${pageId}`;
  }

  private read(pageId: string): Thread[] {
    try {
      const raw = localStorage.getItem(this.keyFor(pageId));
      return raw ? (JSON.parse(raw) as Thread[]) : [];
    } catch {
      return [];
    }
  }

  private write(pageId: string, threads: Thread[]): void {
    localStorage.setItem(this.keyFor(pageId), JSON.stringify(threads));
  }

  list(pageId: string): Promise<Thread[]> {
    return Promise.resolve(this.read(pageId));
  }

  create(thread: Thread): Promise<Thread> {
    const threads = this.read(thread.pageId);
    threads.push(thread);
    this.write(thread.pageId, threads);
    return Promise.resolve(thread);
  }

  reply(threadId: string, reply: Reply): Promise<Reply> {
    // The page a thread belongs to isn't passed in, so find it across pages.
    // In practice the widget only ever has one page loaded, but scanning keeps
    // the transport correct regardless.
    for (const pageId of this.pageKeys()) {
      const threads = this.read(pageId);
      const thread = threads.find((t) => t.id === threadId);
      if (thread) {
        thread.replies.push(reply);
        this.write(pageId, threads);
        break;
      }
    }
    return Promise.resolve(reply);
  }

  setResolved(threadId: string, resolved: boolean): Promise<void> {
    for (const pageId of this.pageKeys()) {
      const threads = this.read(pageId);
      const thread = threads.find((t) => t.id === threadId);
      if (thread) {
        thread.resolved = resolved;
        this.write(pageId, threads);
        break;
      }
    }
    return Promise.resolve();
  }

  /** The pageIds we have stored threads for. */
  private pageKeys(): string[] {
    const prefix = "gtc:preview-comments:";
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) out.push(key.slice(prefix.length));
    }
    return out;
  }
}
