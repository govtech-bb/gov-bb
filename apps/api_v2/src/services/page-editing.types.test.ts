import { expectTypeOf, it } from "vitest";
import type { Employee } from "../modules/auth";
import type { PageDocument, PageContentVersion } from "../modules/page";
import type {
  PageEditLockGeneration,
  PageEditLockToken,
} from "../modules/page-edit-lock";
import type { IPageEditing } from "./page-editing";

function pageEditingCalls(
  editing: IPageEditing,
  page: PageDocument,
  actor: Employee,
  token: PageEditLockToken,
  generation: PageEditLockGeneration,
) {
  void editing.save(page.id, page, page.version, token, actor);
  void editing.delete(page.id, page.version, token, actor);
  // @ts-expect-error Content writes require an acquisition, not only the employee.
  void editing.save(page.id, page, page.version, actor);
  // @ts-expect-error An unparsed number is not evidence of a reviewed page version.
  void editing.delete(page.id, 1, token, actor);
  // @ts-expect-error A public acquisition generation cannot replace a content version.
  void editing.delete(page.id, generation, token, actor);
  // @ts-expect-error The employee's login identity is not an acquisition credential.
  void editing.delete(page.id, page.version, actor.id, actor);
}

it("keeps reviewed versions and ownership credentials distinct in ordinary calls", () => {
  expectTypeOf(pageEditingCalls).parameter(0).toEqualTypeOf<IPageEditing>();
  expectTypeOf<PageEditLockGeneration>().not.toEqualTypeOf<PageContentVersion>();
});
