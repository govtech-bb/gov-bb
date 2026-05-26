import "@testing-library/jest-dom";
import "jest-axe/extend-expect";

// jsdom does not expose structuredClone; polyfill it so helpers that use it
// (e.g. repeatable-helper.ts) work in the test environment.
if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value));
}
