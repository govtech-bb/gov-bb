import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Subpath export — must precede the catch-all, which only maps barrels.
      {
        find: "@govtech-bb/ai-bedrock/converse",
        replacement: r("../../packages/ai-bedrock/src/converse.ts"),
      },
      {
        find: /^@govtech-bb\/(.*)$/,
        replacement: r("../../packages") + "/$1/src/index.ts",
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
