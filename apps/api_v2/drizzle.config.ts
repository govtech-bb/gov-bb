import { defineConfig } from "drizzle-kit";

/**
 * `pnpm db:generate` compares `src/schema.ts` with the last snapshot in
 * `migrations/meta` and writes the difference as the next migration. It never
 * connects to a database; the server applies the migrations itself at boot
 * (`src/migrate.ts`).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
});
