// Wrapper around `import.meta.env.DEV` so tests can mock dev-mode behavior.
// ts-jest-mock-import-meta replaces `import.meta.env` at AST compile time with
// a single fixed object, so call sites cannot be overridden per-test. Routing
// the check through this function makes it `vi.mock()`-able.
export const isDevMode = (): boolean => import.meta.env.DEV;
