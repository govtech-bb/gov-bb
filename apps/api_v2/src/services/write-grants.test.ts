import { describe, expectTypeOf, it } from "vitest";
import { ok } from "../modules/result";
import { grantFor, TEST_EMPLOYEE } from "../test-db";
import type { CategoryRecords } from "./category-editing";
import type { CollectionStore } from "./collection-editing";
import type { PageRecords } from "./page-editing";

describe("a write transaction", () => {
  it("opens only with the grant from its own service's permission check", () => {
    // Never called: the type checker is what runs these.
    const writes = async (
      pages: PageRecords,
      categories: CategoryRecords,
      collections: CollectionStore,
    ) => {
      const nothing = async () => ok(undefined);

      await pages.atomically(
        // @ts-expect-error: a user id isn't a grant.
        TEST_EMPLOYEE.id,
        nothing,
      );
      await categories.atomically(
        // @ts-expect-error: a page grant doesn't open a category write.
        grantFor(TEST_EMPLOYEE, "pages:edit"),
        nothing,
      );
      await collections.atomically(
        // @ts-expect-error: a category grant doesn't open a collection write.
        grantFor(TEST_EMPLOYEE, "categories:manage"),
        nothing,
      );
      await pages.atomically(
        // @ts-expect-error: only authorize makes a grant.
        { actor: TEST_EMPLOYEE.id, permission: "pages:edit" },
        nothing,
      );
      await pages.atomically(grantFor(TEST_EMPLOYEE, "pages:publish"), nothing);
      await categories.atomically(
        grantFor(TEST_EMPLOYEE, "categories:manage"),
        nothing,
      );
      await collections.atomically(
        grantFor(TEST_EMPLOYEE, "collections:manage"),
        nothing,
      );
    };

    expectTypeOf(writes).toBeFunction();
  });
});
