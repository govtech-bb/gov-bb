import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "@govtech-bb/react"],
    // block-kit's source, as tsconfig's paths map it: no prior build needed
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
