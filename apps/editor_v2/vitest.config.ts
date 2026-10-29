import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // block-kit's source, as tsconfig's paths map it: no prior build needed
  resolve: {
    alias: {
      "@govtech-bb/block-kit/contact": fileURLToPath(
        new URL("../../packages/block-kit/src/contact.ts", import.meta.url),
      ),
    },
  },
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
      "scripts/*.test.ts",
      "docs/examples/*.test.ts",
    ],
    testTimeout: 30_000,
  },
});
