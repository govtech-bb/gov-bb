import { expect, it } from "vitest";
import { suggestedUrl } from "./page-markdown";

it("suggests a new page's path from its title, beneath its prefix", () => {
  expect(suggestedUrl("/money-financial-support", "Apply for a Grant!")).toBe(
    "/money-financial-support/apply-for-a-grant",
  );
  expect(suggestedUrl("/youth-and-community/arts-culture", "  Café crème -- 2026 ")).toBe(
    "/youth-and-community/arts-culture/cafe-creme-2026",
  );
});
