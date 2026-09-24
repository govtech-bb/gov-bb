/**
 * The package barrel. Identical to `./document` for now — the block-editor
 * spike's React renderer (`./render`) is not part of #2700 and lands with
 * `landing_v2` in #2702, at which point this file re-exports it too and
 * `./document` stays the server-safe entry point it already is.
 */

export * from "./document";
