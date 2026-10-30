import { expectTypeOf, it } from "vitest";
import type { Employee } from "../modules/auth";
import type { EditorPage, PageContentVersion } from "../modules/page";
import type {
  PageEditLockGeneration,
  PageEditLockToken,
} from "../modules/page-edit-lock";
import type { PageEditing } from "./page-editing";

function pageEditingCalls(
  editing: PageEditing,
  page: EditorPage,
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
  void editing.publish(page.id, page.version, actor);
  // @ts-expect-error A review decision names the page version, not a timestamp.
  void editing.publish(page.id, new Date(page.updated_at), actor);
}

it("keeps reviewed versions and ownership credentials distinct in ordinary calls", () => {
  expectTypeOf(pageEditingCalls).parameter(0).toEqualTypeOf<PageEditing>();
  expectTypeOf<PageEditLockGeneration>().not.toEqualTypeOf<PageContentVersion>();
});
