import { expectTypeOf, it } from "vitest";
import type { ApiPage, EditorApi, SavePageInput } from "./client";
import type { paths } from "./openapi";
import type { PageEditLockGeneration, PageEditLockToken } from "./page-schemas";

function pageClientCalls(
  api: EditorApi,
  page: ApiPage,
  fields: SavePageInput,
  token: PageEditLockToken,
  generation: PageEditLockGeneration,
) {
  void api.savePage(page.id, fields, token);
  void api.deletePage(page.id, page.version, token);
  // @ts-expect-error A reviewed content version alone cannot authorize deletion.
  void api.deletePage(page.id, page.version);
  // @ts-expect-error Saving requires an acquisition credential.
  void api.savePage(page.id, fields);
  // @ts-expect-error A lock generation is not a reviewed content version.
  void api.deletePage(page.id, generation, token);
  // @ts-expect-error Old timestamp preconditions cannot authorize writes.
  void api.deletePage(page.id, page.updated_at, token);
  // @ts-expect-error Activity and acquisition sequences are distinct domains.
  void api.renewPageEditLock(page.id, token, generation);
}

it("retains required evidence in ordinary client calls and matches generated page contracts", () => {
  expectTypeOf(pageClientCalls).parameter(0).toEqualTypeOf<EditorApi>();
  expectTypeOf<ApiPage>().toExtend<
    paths["/pages/{id}"]["get"]["responses"][200]["content"]["application/json"]
  >();
  expectTypeOf<SavePageInput>().toExtend<
    paths["/pages/{id}"]["put"]["requestBody"]["content"]["application/json"]
  >();
});
