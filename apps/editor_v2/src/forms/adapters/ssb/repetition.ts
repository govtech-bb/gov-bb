import type { LegacySsbFormSchema as FormSchema } from "./schema";
import type { FieldArray } from "../../core/repetition";

// SSB conditions read the same page entry locally and the first entry from elsewhere; fieldArray answers are string[].
export function repeatIssues(schema: FormSchema, supports: (kind: string) => boolean) {
  const issues: { code: string; message: string; where: string }[] = [];

  const checkBounds = ({ min, max }: FieldArray, where: string) => {
    if (!Number.isInteger(min) || min < 1 || !Number.isInteger(max) || max < min)
      issues.push({
        code: "repeat-bounds",
        message: "Start with 1 or more, and allow at least as many as you start with",
        where,
      });
  };

  for (const page of schema.pages) {
    for (const value of page.behaviours ?? []) {
      if (value.type !== "repeatable") continue;

      if (page.pageType !== "questions")
        issues.push({
          code: "repeat-page-type",
          message: "Only question pages can repeat",
          where: page.id,
        });

      if (!page.blocks.some((block) => block.type === "question"))
        issues.push({
          code: "repeat-empty",
          message: "A repeating page needs a question for people to answer",
          where: page.id,
        });
      checkBounds(value, page.id);
    }

    for (const block of page.blocks) {
      if (block.type !== "question") continue;

      for (const value of block.behaviours ?? []) {
        if (value.type !== "fieldArray") continue;

        if (!supports(block.kind))
          issues.push({
            code: "field-array-kind",
            message:
              "Answer more than once is available for Text input, Textarea, Number, Email address, Phone number and Time",
            where: block.id,
          });
        checkBounds(value, block.id);
      }
    }
  }

  return issues;
}
