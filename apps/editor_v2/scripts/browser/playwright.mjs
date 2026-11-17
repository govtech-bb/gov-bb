import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadPlaywright() {
  for (const name of ["playwright", "playwright-core", process.env.PLAYWRIGHT_MODULE_PATH].filter(
    Boolean,
  )) {
    let resolved;

    try {
      resolved = require.resolve(name);
    } catch (error) {
      if (error.code === "MODULE_NOT_FOUND") continue;
      throw error;
    }

    const installed = require(resolved);

    if (!installed.chromium)
      throw new Error(`Browser infrastructure: ${name} does not export Chromium`);

    return installed;
  }

  throw new Error(
    "Browser infrastructure unavailable: install nothing automatically. Set PLAYWRIGHT_MODULE_PATH to an existing playwright or playwright-core installation.",
  );
}

export const { chromium } = loadPlaywright();
