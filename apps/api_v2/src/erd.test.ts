/**
 * The README's diagram has to describe the database the migrations build.
 *
 * Like `openapi.json`, the README is a file snapshot: the test renders the
 * migrated database into its ERD block and fails when the committed README
 * differs, so a migration that changes a table also changes the diagram in
 * the same pull request. Update it with `pnpm exec vitest run src/erd.test.ts -u`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { renderErd } from "./erd";
import { createTestDb } from "./test-db";

const README = join(__dirname, "../README.md");
const BLOCK = /(<!-- ERD:START[^>]*-->\n)[\s\S]*?(<!-- ERD:END -->)/;

describe("README ERD", () => {
  it("matches the migrated database", async () => {
    const { db, close } = await createTestDb();
    const diagram = await renderErd(db);
    await close();

    const readme = readFileSync(README, "utf8");
    expect(readme).toMatch(BLOCK);

    await expect(
      readme.replace(
        BLOCK,
        (_, start: string, end: string) =>
          `${start}\n\`\`\`mermaid\n${diagram}\`\`\`\n\n${end}`,
      ),
    ).toMatchFileSnapshot("../README.md");
  });

  it("shows a column a migration adds", async () => {
    const { db, close } = await createTestDb();
    await db.execute(sql`alter table categories add column colour text`);

    const diagram = await renderErd(db);
    expect(diagram).toContain('    text colour "nullable"\n');
    expect(diagram).not.toContain("schema_migrations");

    await close();
  });

  it("writes a two-part precision without the comma Mermaid refuses", async () => {
    const { db, close } = await createTestDb();
    await db.execute(sql`alter table categories add column fee numeric(10,2)`);

    expect(await renderErd(db)).toContain('    numeric(10-2) fee "nullable"\n');

    await close();
  });
});
