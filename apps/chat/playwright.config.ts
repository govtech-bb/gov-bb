import { defineConfig, devices } from "@playwright/test";

// E2E config for the chat forms flow. The dev server is booted with LLM_MOCK=1
// so the scripted mock adapter (src/lib/chat/mock-adapter.ts) drives a
// deterministic forms-collection loop — no real model, embeddings, or vector DB.
// Everything else is real: the agent loop, the server form tools (against the
// live sandbox forms API for the contract), the shared validation/coercion
// engine, the approval gate, and the React widgets. SUBMIT_LIVE is left unset so
// the final submit dry-runs (never writes to the forms API).
//
// A dedicated port (3091) avoids colliding with a hand-run `pnpm dev` (3001).
const PORT = 3091;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  // The forms-API fetch on the first turn can take a moment; give assertions room.
  expect: { timeout: 20_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      LLM_MOCK: "1",
      LLM_MOCK_FORM: "chat-feedback",
      FEATURE_FORMS: "1",
      FEATURE_FEEDBACK: "1",
    },
  },
});
