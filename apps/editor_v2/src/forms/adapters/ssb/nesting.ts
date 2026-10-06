import { checkId } from "../../core/identities";
import type { LegacySsbFormSchema as FormSchema } from "./schema";

/** Existing SSB nesting behavior, independent of editor queries. */
export type FieldConditionalOnBehaviour = {
  type: "fieldConditionalOn";
  targetFieldId: string;
  operator: "equal" | "in";
  value: string | boolean | string[];
};

/** Checks the flat output's ownership and the content blocks' SSB constraints. */
export function nestingIssues(schema: FormSchema) {
  const issues: { code: string; message: string; where: string }[] = [];
  const blocks = schema.pages.flatMap((page) => page.blocks);

  const taken = new Set(
    blocks.flatMap((block) => (block.type === "question" ? [block.fieldId] : [])),
  );

  for (const page of schema.pages) {
    const byId = new Map(page.blocks.map((block) => [block.id, block]));

    for (const block of page.blocks)
      if (block.type === "question") for (const option of block.options) byId.set(option.id, block);

    for (const block of page.blocks) {
      const add = (code: string, message: string) =>
        issues.push({ code, message, where: block.id });

      if (block.type === "section" || block.type === "callout") {
        const error = checkId(block.fieldId, taken, undefined, "block");

        if (error) add("field-id", error);
        taken.add(block.fieldId);
      }

      if (block.type === "section") {
        if (!block.summary.trim())
          add(
            "section-summary",
            "Write the show/hide’s summary: name what it reveals, like ‘What is a parish?’",
          );

        if (!page.blocks.some((node) => node.under === block.id))
          add("section-empty", "Put what the show/hide reveals under its summary");
        let parent = block.under && byId.get(block.under);
        const seen = new Set<string>();

        while (parent && !seen.has(parent.id)) {
          if (parent.type === "section") {
            add(
              "nested-show-hide",
              "Don’t put a show/hide inside another one: GovBB doesn’t nest them",
            );
            break;
          }

          seen.add(parent.id);
          parent = parent.under && byId.get(parent.under);
        }
      }

      if (block.type === "callout" && !block.markdown.trim())
        add(
          "callout-empty",
          block.variant === "inset"
            ? "Write the inset text, or delete it"
            : "Write the warning, or delete it",
        );
    }
  }

  return issues;
}
