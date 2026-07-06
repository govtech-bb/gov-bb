import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { migrations } from "./index";
import * as migrationBarrel from "./migrations/index";

// A migration file created on disk is inert until it is (a) re-exported from
// the migrations barrel and (b) listed in the `migrations` array that the
// DataSource actually runs. Forgetting (b) means `migration:run` skips it, the
// column/table it should create never exists, and every query touching the
// mapped-but-absent column fails at runtime (see #1747: processors_failed).
const migrationsDir = join(__dirname, "migrations");

function isMigrationClass(value: unknown): value is new () => { up: unknown } {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { up?: unknown } }).prototype?.up ===
      "function"
  );
}

describe("migration registration", () => {
  const barrelClasses = Object.values(migrationBarrel).filter(isMigrationClass);
  const migrationFiles = readdirSync(migrationsDir).filter(
    (file) => /^\d+-.+\.ts$/.test(file) && !file.endsWith(".spec.ts"),
  );

  it("re-exports every migration file from the barrel", () => {
    expect(barrelClasses).toHaveLength(migrationFiles.length);
  });

  it("registers every migration in the DataSource migrations array", () => {
    const registered = new Set(migrations.map((m) => m.name));
    const missing = barrelClasses
      .map((cls) => cls.name)
      .filter((name) => !registered.has(name));
    expect(missing).toEqual([]);
  });
});
