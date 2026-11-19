/** Inspect one history event; --apply replaces its snapshot without changing audit metadata. */
import { parseArgs } from "node:util";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseConfig } from "./config";
import { connect, createPool } from "./db";
import { changeEvents } from "./schema";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "event-id": { type: "string" },
      reason: { type: "string" },
      by: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const args = z
    .object({
      "event-id": z.uuid(),
      reason: z.string().trim().min(1),
      by: z.string().trim().min(1),
      apply: z.boolean(),
    })
    .safeParse(values);
  if (!args.success) {
    console.error(
      "History redaction requires --event-id <UUID>, --reason <ticket> and --by <operator>. Add --apply to write.",
    );
    process.exitCode = 1;
    return;
  }
  const parsed = parseConfig(process.env);
  if (!parsed.ok) {
    console.error(parsed.error.message, parsed.error.fields);
    process.exitCode = 1;
    return;
  }
  const config = parsed.value;
  const created = createPool(config.database, console);
  if (!created.ok) {
    console.error(created.error.message);
    process.exitCode = 1;
    return;
  }
  const pool = created.value;
  try {
    const connected = await connect(pool, config.database);
    if (!connected.ok) {
      console.error(connected.error.message);
      process.exitCode = 1;
      return;
    }
    const { "event-id": id, reason, by, apply } = args.data;
    const outcome = await connected.value.transaction(async (tx) => {
      const [event] = await tx
        .select({
          id: changeEvents.id,
          entity_kind: changeEvents.entityKind,
          entity_id: changeEvents.entityId,
          version_no: changeEvents.versionNo,
          action: changeEvents.action,
          actor: changeEvents.actor,
          occurred_at: changeEvents.occurredAt,
          redacted: sql<boolean>`coalesce(${changeEvents.snapshot}->'redacted' = 'true'::jsonb, false)`,
        })
        .from(changeEvents)
        .where(eq(changeEvents.id, id))
        .for("update");
      if (!event) return { error: "event_not_found" } as const;
      const { redacted, ...metadata } = event;
      if (redacted) return { error: "already_redacted" } as const;
      if (apply) {
        await tx.execute(sql`select set_config('app.redacting', 'on', true)`);
        const changed = await tx
          .update(changeEvents)
          .set({ snapshot: { redacted: true, reason, by } })
          .where(eq(changeEvents.id, id))
          .returning({ id: changeEvents.id });
        if (changed.length !== 1)
          throw new Error("History redaction did not update exactly one event");
      }
      return { event: metadata };
    });
    if ("error" in outcome) {
      console.error(`History redaction refused: ${outcome.error}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      JSON.stringify({
        mode: apply ? "apply" : "dry-run",
        database: config.database.database,
        event: outcome.event,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // Driver errors can contain snapshot content or connection credentials.
  console.error(
    "History redaction failed. Check arguments, database access and migrations before retrying.",
  );
  process.exitCode = 1;
});
