import { fileURLToPath } from "node:url";

const blockKit = (entry: string) =>
  fileURLToPath(
    new URL(`../../packages/block-kit/src/${entry}.ts`, import.meta.url),
  );

/**
 * Straight to block-kit's source. Its `exports` map points at its build
 * output, which is right for `node dist/src/main.js` and wrong here — it
 * would make `nx run api_v2:test` fail until someone had built a different
 * project first, and a test suite that depends on build order is a test suite
 * that fails for reasons no one can read.
 */
export const alias = {
  "@govtech-bb/block-kit/document": blockKit("document"),
  "@govtech-bb/block-kit": blockKit("index"),
};
