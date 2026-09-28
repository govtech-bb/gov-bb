/**
 * The seed corpus on its own.
 *
 * The package barrel also exports `./client`, which constructs a browser
 * `Worker` — importing it from Node would fail on that alone. So the data
 * gets its own entry point, the same way `@govtech-bb/content/categories`
 * does, and `apps/api_v2` seeds from the identical source the browser uses
 * rather than from a copy that would drift.
 */

export * from "./collections";
export * from "./documents";
