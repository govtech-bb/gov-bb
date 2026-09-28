/**
 * The package barrel: the document format and its React renderer.
 *
 * A site that renders pages imports this. A server that only validates or
 * stores documents imports `./document` instead, which is the same format and
 * rules without `./render`, so it never loads React or the design system.
 */

// Assumption (#2702): 15 — the renderer lives here and the barrel re-exports
// it; `./document` stays React-free so `apps/api_v2` never loads React.
export * from "./document";
export * from "./render";
