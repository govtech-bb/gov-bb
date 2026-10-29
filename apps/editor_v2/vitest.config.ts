import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom", "@govtech-bb/react"] },
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
