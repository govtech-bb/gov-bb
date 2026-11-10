import { z } from "zod";
import { PageId, PageUrl, Visibility } from "./page";
import { canSee } from "./page-visibility";
import type { PageChangeEvent } from "./page-history";

/** Live page snapshots only; review events describe revisions, not public addresses. */
export const PAGE_REDIRECT_LIVE_ACTIONS = [
  "created",
  "updated",
  "published",
  "unpublished",
  "reverted",
  "deleted",
] as const;

/** Routing evidence from the append-only page history; null order cannot prove historical reachability. */
export interface PageRedirectHistoryEvent {
  readonly entityId: string;
  readonly versionNo: number;
  readonly action: PageChangeEvent["action"];
  readonly eventOrder: number | null;
  readonly snapshotVersion: number | null;
  readonly snapshot: unknown;
}

const routingSnapshot = z.object({
  id: PageId,
  url: PageUrl,
  parent_id: PageId.nullable(),
  visibility: Visibility,
  redacted: z.literal(false).nullish(),
});
type RoutingSnapshot = z.infer<typeof routingSnapshot>;
type HistoryState = {
  event: PageRedirectHistoryEvent;
  snapshot: RoutingSnapshot | undefined;
};
type PublicAddress = { url: string; since: number };

/** Recover former public URLs only where ordered live snapshots prove reachability and continued ownership. */
export class PageRedirectHistory {
  private readonly histories = new Map<string, HistoryState[]>();

  constructor(events: readonly PageRedirectHistoryEvent[]) {
    for (const event of events) {
      if (!PAGE_REDIRECT_LIVE_ACTIONS.some((action) => action === event.action))
        continue;
      const parsed = routingSnapshot.safeParse(event.snapshot);
      const snapshot =
        (event.snapshotVersion === null || event.snapshotVersion === 1) &&
        parsed.success &&
        parsed.data.id === event.entityId
          ? parsed.data
          : undefined;
      const history = this.histories.get(event.entityId) ?? [];
      history.push({ event, snapshot });
      this.histories.set(event.entityId, history);
    }
    for (const history of this.histories.values())
      history.sort((a, b) => a.event.versionNo - b.event.versionNo);
  }

  /** The current record's last public address, never an earlier lifetime or another owner's URL. */
  sourceFor(page: {
    id: PageId;
    url: string;
    parentId: PageId | null;
    visibility: Visibility;
  }): string | null {
    const history = this.histories.get(page.id);
    const created = history?.findLast(
      ({ event }) => event.action === "created",
    );
    const latest = history?.at(-1);
    if (
      !created ||
      !latest?.snapshot ||
      history?.some(
        ({ event }) =>
          event.action === "deleted" &&
          event.versionNo > created.event.versionNo,
      ) ||
      latest.snapshot.url !== page.url ||
      latest.snapshot.parent_id !== page.parentId ||
      latest.snapshot.visibility !== page.visibility
    )
      return null;

    for (const address of this.publicAddresses(
      page.id,
      created.event.eventOrder ?? 0,
      created.event.versionNo,
    )) {
      if (address === null) return null;
      return this.wasReclaimed(page.id, address) ? null : address.url;
    }
    return null;
  }

  private wasReclaimed(pageId: PageId, address: PublicAddress): boolean {
    for (const [id, history] of this.histories) {
      if (id === pageId) continue;
      // A redacted row could have held this URL, even if every remaining snapshot uses another one.
      if (
        history.some(
          ({ event, snapshot }, index) =>
            snapshot === undefined &&
            event.eventOrder !== null &&
            (event.eventOrder >= address.since ||
              (event.action !== "deleted" &&
                (history[index + 1]?.event.eventOrder ?? Infinity) >=
                  address.since)),
        )
      )
        return true;
      if (!history.some(({ snapshot }) => snapshot?.url === address.url))
        continue;
      for (const owned of this.publicAddresses(id, address.since)) {
        if (owned === null || owned.url === address.url) return true;
      }
    }
    return false;
  }

  /** Walk historical states backwards under audit order; null means the evidence is incomplete. */
  private *publicAddresses(
    pageId: string,
    since: number,
    createdVersion?: number,
  ): Generator<PublicAddress | null> {
    const histories = new Map<string, HistoryState[]>();
    const pending = [pageId];
    while (pending.length) {
      const id = pending.pop();
      if (id === undefined || histories.has(id)) continue;
      const history = (this.histories.get(id) ?? []).filter(
        ({ event }) =>
          id !== pageId ||
          createdVersion === undefined ||
          event.versionNo >= createdVersion,
      );
      histories.set(id, history);
      let previousOrder = 0;
      for (const { event, snapshot } of history) {
        if (snapshot?.parent_id) pending.push(snapshot.parent_id);
        if (event.eventOrder === null && previousOrder === 0) continue;
        if (event.eventOrder === null || event.eventOrder <= previousOrder) {
          yield null;
          return;
        }
        previousOrder = event.eventOrder;
      }
    }

    const positions = new Map(
      [...histories].map(([id, history]) => [id, history.length - 1]),
    );
    const changes = [...histories]
      .flatMap(([id, history]) =>
        history.flatMap(({ event }, index) =>
          event.eventOrder !== null && event.eventOrder >= since
            ? [{ id, index, order: event.eventOrder }]
            : [],
        ),
      )
      .sort((a, b) => b.order - a.order);

    const visibleAddress = (): PublicAddress | null | undefined => {
      let id: string | null = pageId;
      let url: string | undefined;
      let publicSince = 0;
      const seen = new Set<string>();
      while (id !== null) {
        if (seen.has(id)) return null;
        seen.add(id);
        const position: number = positions.get(id) ?? -1;
        const state: HistoryState | undefined = histories.get(id)?.[position];
        if (!state) return id === pageId && position < 0 ? undefined : null;
        if (state.event.action === "deleted")
          return id === pageId ? undefined : null;
        if (!state.snapshot) return null;
        if (!canSee("public", state.snapshot.visibility)) return undefined;
        if (state.event.eventOrder === null) return null;
        url ??= state.snapshot.url;
        publicSince = Math.max(publicSince, state.event.eventOrder);
        id = state.snapshot.parent_id;
      }
      return url === undefined ? null : { url, since: publicSince };
    };

    for (const change of [...changes, null]) {
      const address = visibleAddress();
      if (address !== undefined) yield address;
      if (address === null || change === null) return;
      if (change.order === since && createdVersion === undefined) return;
      if (!histories.get(change.id)?.[change.index]?.snapshot) {
        yield null;
        return;
      }
      positions.set(change.id, change.index - 1);
    }
  }
}
