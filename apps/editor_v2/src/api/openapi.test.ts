import openapiTS, { astToString } from "openapi-typescript";
import { expect, test } from "vitest";

const BANNER =
  "// Generated from apps/api_v2/openapi.json by src/api/openapi.test.ts.\n" +
  "// Regenerate with `pnpm exec vitest run src/api/openapi.test.ts -u`.\n\n";

test("the API types match api_v2's committed spec", async () => {
  const types = astToString(
    await openapiTS(new URL("../../../api_v2/openapi.json", import.meta.url)),
  );

  await expect(BANNER + types).toMatchFileSnapshot("./openapi.d.ts");
});
