import type { FormPage } from "./schema";
import type { WordingTarget } from "../../core/dynamic-text";

export function wordingTargets(pages: FormPage[]): WordingTarget[] {
  return pages.flatMap((page) =>
    page.blocks.flatMap((block) =>
      block.type === "question"
        ? [
            {
              key: block.id,
              fieldId: block.fieldId,
              stepId: page.stepId,
              kind: block.kind,
              options: block.options,
            },
          ]
        : [],
    ),
  );
}
