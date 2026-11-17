import { z } from "zod";

/** Editor-only attribution from an entity's latest recorded change, not its pending revision's contributors. */
export const LastEditedBy = z
  .object({
    id: z.string().describe("The event's actor id, or `system`."),
    name: z
      .string()
      .nullable()
      .describe(
        "Their name, or null when unavailable; `System` for system events.",
      ),
  })
  .nullable()
  .describe(
    "The actor of the entity's highest version_no change_event, including page review steps. " +
      "Null when there is no event. Pending-revision saves are not recorded, so this is not " +
      "necessarily the author of the working copy or its updated_at.",
  );

/** Null means no recorded change; a null name preserves an existing actor whose name is unavailable. */
export type LastEditedBy = z.infer<typeof LastEditedBy>;
