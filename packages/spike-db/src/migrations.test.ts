import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATION_001_INIT } from "./migrations";

describe("the generated migration module", () => {
  it("matches migrations/001_init.sql exactly", () => {
    // The .sql file is what Sprint 1 gets handed; the module is what the
    // browser runs. If they drift, the spike stops proving anything about
    // the real DDL. Regenerate with `pnpm --filter @govtech-bb/spike-db generate`.
    const onDisk = readFileSync(
      join(__dirname, "../migrations/001_init.sql"),
      "utf8",
    );
    expect(MIGRATION_001_INIT).toBe(onDisk);
  });
});
