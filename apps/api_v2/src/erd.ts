/**
 * The README's entity-relationship diagram, read from a migrated database.
 *
 * It reads the catalog rather than `schema.ts` because the SQL migrations are
 * the source of truth: they carry triggers and data steps Drizzle cannot
 * express, so the migrated database is what is actually deployed. Tables are
 * in name order and columns in the order the migrations created them, so the
 * same migrations always render the same text.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db";

const COLUMNS = z.array(
  z.object({
    table: z.string(),
    column: z.string(),
    type: z.string(),
    not_null: z.boolean(),
    generated: z.boolean(),
  }),
);

const KEYS = z.array(
  z.object({
    table: z.string(),
    kind: z.enum(["p", "f", "u"]),
    columns: z.array(z.string()),
    references: z.string().nullable(),
    referenced: z.array(z.string()),
  }),
);

/** `_text` is how the catalog names `text[]`. */
const typeName = (udt: string) =>
  udt.startsWith("_") ? `${udt.slice(1)}[]` : udt;

/** A Mermaid `erDiagram` of every public table but the migration ledger. */
export async function renderErd(db: Database): Promise<string> {
  const columns = COLUMNS.parse(
    (
      await db.execute(sql`
        select c.relname::text as table, a.attname::text as column,
               t.typname::text as type, a.attnotnull as not_null,
               a.attgenerated <> '' as generated
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_type t on t.oid = a.atttypid
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and c.relname <> 'schema_migrations'
          and a.attnum > 0 and not a.attisdropped
        order by c.relname, a.attnum`)
    ).rows,
  );
  const keys = KEYS.parse(
    (
      await db.execute(sql`
        select c.relname::text as table, con.contype::text as kind,
               array(
                 select a.attname::text
                 from unnest(con.conkey) with ordinality k(attnum, i)
                 join pg_attribute a
                   on a.attrelid = con.conrelid and a.attnum = k.attnum
                 order by k.i
               ) as columns,
               f.relname::text as references,
               array(
                 select a.attname::text
                 from unnest(con.confkey) with ordinality k(attnum, i)
                 join pg_attribute a
                   on a.attrelid = con.confrelid and a.attnum = k.attnum
                 order by k.i
               ) as referenced
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_class f on f.oid = con.confrelid
        where n.nspname = 'public' and con.contype in ('p', 'f', 'u')
          and c.relname <> 'schema_migrations'
        order by c.relname, con.conname`)
    ).rows,
  );

  const keyed = (table: string, column: string, kind: "p" | "f" | "u") =>
    keys.some(
      (key) =>
        key.table === table &&
        key.kind === kind &&
        key.columns.includes(column),
    );

  const lines = ["erDiagram"];
  const tables = [...new Set(columns.map((column) => column.table))];
  for (const table of tables) {
    lines.push(`  ${table} {`);
    for (const column of columns.filter((c) => c.table === table)) {
      const marks = [
        keyed(table, column.column, "p") && "PK",
        keyed(table, column.column, "f") && "FK",
        keyed(table, column.column, "u") && "UK",
      ].filter(Boolean);
      lines.push(
        [
          `    ${typeName(column.type)} ${column.column}`,
          marks.length > 0 && marks.join(", "),
          column.generated ? '"generated"' : !column.not_null && '"nullable"',
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
    lines.push("  }");
  }

  for (const key of keys.filter((k) => k.kind === "f")) {
    // A nullable reference means the row may have no parent.
    const optional = key.columns.some(
      (name) =>
        !columns.find((c) => c.table === key.table && c.column === name)
          ?.not_null,
    );
    // Name both ends: a composite key may target a unique key, not the PK.
    lines.push(
      `  ${key.references} ${optional ? "|o" : "||"}--o{ ${key.table} : "${key.columns.join(", ")} -> ${key.referenced.join(", ")}"`,
    );
  }

  return `${lines.join("\n")}\n`;
}
