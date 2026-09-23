/**
 * The document format without the renderer.
 *
 * The barrel re-exports `./render`, which is React. A server importing the
 * barrel to validate a document would drag React and the design system into
 * its build for no reason — the inverse of the mistake ADR 0056 records,
 * where a barrel pulled `node:fs/promises` into a browser bundle.
 *
 * So the pure core gets its own entry point: types, the Zod schema, the nine
 * rules, the href allowlist and the date arithmetic. `apps/api_v2` imports
 * this, which is what lets one implementation of the rules run on both
 * sides of the wire instead of two that drift.
 */

export * from "./types";
export * from "./href";
export * from "./schema";
export * from "./validate";
export * from "./dates";
export * from "./holidays";
export * from "./holiday-rules";
export * from "./facets";
