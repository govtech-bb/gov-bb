import type { Employee, UserId } from "../modules/auth";
import {
  categoryAddress,
  CategoryConflict,
  CategoryInUse,
  CategoryNotFound,
  CategoryRejected,
  CategoryStamp,
  nextCategoryStamp,
  parseCategoryFields,
  parseCategoryOrder,
  type CategoryBlockers,
  type CategoryFields,
  type CategoryId,
  type CategoryOrder,
  type CategoryValues,
  type EditorCategory,
} from "../modules/category";
import type { ContentStoreUnavailable } from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import type { Clock } from "./page-editing";

/** Content persistence; every write transaction takes the shared content lock before any other locks. */
export interface CategoryRecords {
  /**
   * Run `work` as one transaction on behalf of `actorId`, whom storage
   * records against every change it makes; a failed Result rolls back all
   * writes, and the shared advisory lock is acquired first.
   */
  atomically<R extends Result<unknown, Error>>(
    actorId: UserId,
    work: (records: CategoryRecords) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>>;
  /** All category rows in sibling order, with direct-service counts of every visibility. */
  editorCategories(): Promise<
    Result<EditorCategory[], ContentStoreUnavailable>
  >;
  /** All assigned pages and immediate children, regardless of visibility. */
  categoryBlockers(
    id: CategoryId,
  ): Promise<
    Result<Omit<CategoryBlockers, "reserved_route">, ContentStoreUnavailable>
  >;
  /** Whether a stored page already owns this exact URL. */
  pageOwnsCategoryUrl(
    url: string,
  ): Promise<Result<boolean, ContentStoreUnavailable>>;
  /** Insert one category at the chosen destination position. */
  insertCategory(
    fields: CategoryValues,
    position: number,
    stamp: CategoryStamp,
  ): Promise<Result<CategoryId, CategoryRejected | ContentStoreUnavailable>>;
  /**
   * Replace category fields without changing any page or sibling. Returns the
   * stored stamp, which stays the old one when nothing else changed.
   */
  replaceCategory(
    id: CategoryId,
    fields: CategoryValues,
    position: number,
    stamp: CategoryStamp,
  ): Promise<Result<CategoryStamp, CategoryRejected | ContentStoreUnavailable>>;
  /** Delete an already-checked empty category. */
  removeCategory(
    id: CategoryId,
  ): Promise<Result<void, ContentStoreUnavailable>>;
}

/** Expected failures of a versioned category update. */
export type CategoryUpdateFailure =
  | CategoryRejected
  | CategoryNotFound
  | CategoryConflict
  | ContentStoreUnavailable;

/** Expected failures of category deletion, including all occupancy blockers. */
export type CategoryDeleteFailure =
  | CategoryNotFound
  | CategoryConflict
  | CategoryInUse
  | ContentStoreUnavailable;

/** The authenticated category operations, without framework or database types. */
export interface ICategoryEditing {
  /** Every category for every editor picker, parents before children. */
  list(): Promise<Result<EditorCategory[], ContentStoreUnavailable>>;
  /** Append a new category to its current destination. */
  create(
    fields: CategoryFields,
    actor: Employee,
  ): Promise<
    Result<EditorCategory, CategoryRejected | ContentStoreUnavailable>
  >;
  /** Save only if the opened version still matches; occupied addresses cannot move. */
  update(
    id: CategoryId,
    fields: CategoryFields,
    expected: CategoryStamp,
    actor: Employee,
  ): Promise<Result<EditorCategory, CategoryUpdateFailure>>;
  /** Replace a complete sibling order if every expected ID and stamp still matches. */
  reorder(
    order: CategoryOrder,
    actor: Employee,
  ): Promise<
    Result<
      EditorCategory[],
      CategoryRejected | CategoryConflict | ContentStoreUnavailable
    >
  >;
  /** Refuse stale or occupied deletion without moving any content. */
  delete(
    id: CategoryId,
    expected: CategoryStamp,
    actor: Employee,
  ): Promise<Result<void, CategoryDeleteFailure>>;
}

/** Category workflow owner; every write is recorded against the acting employee. */
export class CategoryEditing implements ICategoryEditing {
  /** The composition root supplies content storage and time. */
  constructor(
    private readonly records: CategoryRecords,
    private readonly clock: Clock,
  ) {}

  /** All categories, each parent immediately followed by its ordered children. */
  async list(): Promise<Result<EditorCategory[], ContentStoreUnavailable>> {
    const rows = await this.records.editorCategories();
    return rows.ok
      ? ok(
          rows.value
            .filter((row) => row.parent_id === null)
            .flatMap((row) => [
              row,
              ...rows.value.filter((child) => child.parent_id === row.id),
            ]),
        )
      : rows;
  }

  /** Append under the shared lock, without a stale sibling precondition. */
  async create(
    fields: CategoryFields,
    actor: Employee,
  ): Promise<
    Result<EditorCategory, CategoryRejected | ContentStoreUnavailable>
  > {
    const parsed = parseCategoryFields(fields);
    if (!parsed.ok) return parsed;
    return this.records.atomically(actor.id, async (records) => {
      const rows = await records.editorCategories();
      if (!rows.ok) return rows;
      const url = categoryAddress(parsed.value, rows.value);
      if (!url.ok) return url;
      const available = await availableAddress(records, url.value);
      if (!available.ok) return available;
      const position = appendPosition(rows.value, fields.parent_id);
      const stamp = CategoryStamp.parse(this.clock().toISOString());
      const inserted = await records.insertCategory(
        parsed.value,
        position,
        stamp,
      );
      return inserted.ok
        ? readSavedCategory(records, inserted.value)
        : inserted;
    });
  }

  /** Only an empty, unanchored category may change its slug or parent. */
  async update(
    id: CategoryId,
    fields: CategoryFields,
    expected: CategoryStamp,
    actor: Employee,
  ): Promise<Result<EditorCategory, CategoryUpdateFailure>> {
    const parsed = parseCategoryFields(fields);
    if (!parsed.ok) return parsed;
    return this.records.atomically(actor.id, async (records) => {
      const rows = await records.editorCategories();
      if (!rows.ok) return rows;
      const current = rows.value.find((row) => row.id === id);
      if (!current) return err(new CategoryNotFound(id));
      if (!sameStamp(current.updated_at, expected))
        return err(new CategoryConflict());
      const moves =
        current.slug !== parsed.value.slug ||
        current.parent_id !== fields.parent_id;
      if (moves) {
        const blockers = await records.categoryBlockers(id);
        if (!blockers.ok) return blockers;
        if (
          current.reserved_route ||
          blockers.value.pages > 0 ||
          blockers.value.subcategories > 0
        )
          return err(
            new CategoryRejected([
              {
                field:
                  current.slug !== parsed.value.slug ? "slug" : "parent_id",
                message:
                  "This address is in use by pages, subcategories or an app route.",
              },
            ]),
          );
        const address = categoryAddress(parsed.value, rows.value, id);
        if (!address.ok) return address;
        const available = await availableAddress(records, address.value);
        if (!available.ok) return available;
      }
      const position =
        current.parent_id === fields.parent_id
          ? current.position
          : appendPosition(rows.value, fields.parent_id);
      const written = await records.replaceCategory(
        id,
        parsed.value,
        position,
        nextCategoryStamp(current.updated_at, this.clock()),
      );
      return written.ok ? readSavedCategory(records, id) : written;
    });
  }

  /** A stale sibling snapshot never partially replaces the current order. */
  async reorder(
    order: CategoryOrder,
    actor: Employee,
  ): Promise<
    Result<
      EditorCategory[],
      CategoryRejected | CategoryConflict | ContentStoreUnavailable
    >
  > {
    const parsed = parseCategoryOrder(order);
    if (!parsed.ok) return parsed;
    return this.records.atomically(actor.id, async (records) => {
      const rows = await records.editorCategories();
      if (!rows.ok) return rows;
      if (
        order.parent_id !== null &&
        !rows.value.some(
          (row) => row.id === order.parent_id && row.parent_id === null,
        )
      )
        return err(
          new CategoryRejected([
            {
              field: "parent_id",
              message: "Choose a top-level category as the parent.",
            },
          ]),
        );
      const siblings = rows.value.filter(
        (row) => row.parent_id === order.parent_id,
      );
      if (
        siblings.length !== order.expected.length ||
        order.expected.some(
          (expected) =>
            !siblings.some(
              (row) =>
                row.id === expected.id &&
                sameStamp(row.updated_at, expected.updated_at),
            ),
        )
      )
        return err(new CategoryConflict());
      for (const [position, id] of order.ordered_ids.entries()) {
        const current = siblings.find((row) => row.id === id);
        if (!current)
          throw new Error("Category reorder lost a checked sibling");
        if (current.position === position) continue;
        const written = await records.replaceCategory(
          id,
          current,
          position,
          nextCategoryStamp(current.updated_at, this.clock()),
        );
        if (!written.ok) return written;
      }
      const saved = await records.editorCategories();
      return saved.ok
        ? ok(saved.value.filter((row) => row.parent_id === order.parent_id))
        : saved;
    });
  }

  /** Check the original version before reporting all deletion blockers. */
  async delete(
    id: CategoryId,
    expected: CategoryStamp,
    actor: Employee,
  ): Promise<Result<void, CategoryDeleteFailure>> {
    return this.records.atomically(actor.id, async (records) => {
      const rows = await records.editorCategories();
      if (!rows.ok) return rows;
      const current = rows.value.find((row) => row.id === id);
      if (!current) return err(new CategoryNotFound(id));
      if (!sameStamp(current.updated_at, expected))
        return err(new CategoryConflict());
      const usage = await records.categoryBlockers(id);
      if (!usage.ok) return usage;
      const blockers = {
        ...usage.value,
        reserved_route: current.reserved_route,
      };
      if (
        blockers.pages > 0 ||
        blockers.subcategories > 0 ||
        blockers.reserved_route
      )
        return err(new CategoryInUse(blockers));
      return records.removeCategory(id);
    });
  }
}

/** Read back trigger-authored metadata, including attribution retained by a no-op. */
async function readSavedCategory(
  records: CategoryRecords,
  id: CategoryId,
): Promise<Result<EditorCategory, ContentStoreUnavailable>> {
  const rows = await records.editorCategories();
  if (!rows.ok) return rows;
  const saved = rows.value.find((row) => row.id === id);
  if (!saved)
    throw new Error("Saved category missing inside its write transaction");
  return ok(saved);
}

function sameStamp(a: CategoryStamp, b: CategoryStamp): boolean {
  return Date.parse(a) === Date.parse(b);
}

function appendPosition(
  rows: readonly EditorCategory[],
  parentId: CategoryId | null,
): number {
  return (
    Math.max(
      -1,
      ...rows
        .filter((row) => row.parent_id === parentId)
        .map((row) => row.position),
    ) + 1
  );
}

async function availableAddress(
  records: CategoryRecords,
  url: string,
): Promise<Result<void, CategoryRejected | ContentStoreUnavailable>> {
  const occupied = await records.pageOwnsCategoryUrl(url);
  if (!occupied.ok) return occupied;
  return occupied.value
    ? err(
        new CategoryRejected([
          { field: "slug", message: "A page already uses this address." },
        ]),
      )
    : ok(undefined);
}
