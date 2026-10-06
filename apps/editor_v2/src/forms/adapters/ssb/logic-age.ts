import type { LegacySsbFormSchema as FormSchema } from "./schema";
import type { Condition } from "../../core/logic";
import { ageConditionError } from "../../core/logic-age";

export function logicAgeIssues(schema: FormSchema) {
  const fields = new Map(
    schema.pages.flatMap((page) =>
      page.blocks.flatMap((block) =>
        block.type === "question" ? [[block.id, block.kind] as const] : [],
      ),
    ),
  );

  const issues: { code: string; message: string; where: string }[] = [];

  for (const page of schema.pages)
    for (const block of page.blocks) {
      if (block.type !== "logic") continue;

      const visit = (condition: Condition) => {
        if (condition.type === "GROUP") return condition.conditionals.forEach(visit);
        const message = ageConditionError(condition, fields.get(condition.field ?? ""));

        if (message) issues.push({ code: "logic-age", message, where: block.id });
      };

      block.conditionals.forEach(visit);
    }

  return issues;
}
