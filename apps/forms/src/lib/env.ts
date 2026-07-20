// Wrapper around `import.meta.env.DEV` so tests can mock dev-mode behavior.
// Vitest can't redefine `import.meta.env.DEV` per-test, so a call site reading
// it directly can't be varied. Routing the check through this function makes it
// `vi.mock()`-able.
export const isDevMode = (): boolean => import.meta.env.DEV;
