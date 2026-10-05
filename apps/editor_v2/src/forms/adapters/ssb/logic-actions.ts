import type { ActionType } from "../../core/logic";
import type { FieldIssue } from "../../core/fields";
import type { LegacySsbFormSchema } from "./schema";

/** An absent authoring feature keeps its stored payload and reports the active unavailable action. */
export function unavailableLogicActions(
  schema: LegacySsbFormSchema,
  available: readonly { type: ActionType }[],
): FieldIssue[] {
  const installed = new Set(available.map((action) => action.type));

  return schema.pages.flatMap((page) =>
    page.blocks.flatMap((block) =>
      block.type === "logic"
        ? block.actions.flatMap((action) =>
            action.type && !installed.has(action.type)
              ? [
                  {
                    code: "unavailable-logic-action",
                    where: block.id,
                    message: `The ${action.type.toLowerCase().replaceAll("_", " ")} action is unavailable in this editor. Its saved settings are retained.`,
                  },
                ]
              : [],
          )
        : [],
    ),
  );
}
