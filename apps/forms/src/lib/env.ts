// Wrapper around `import.meta.env.DEV` so tests can mock dev-mode behavior.
// ts-jest-mock-import-meta replaces `import.meta.env` at AST compile time with
// a single fixed object, so call sites cannot be overridden per-test. Routing
// the check through this function makes it `jest.mock()`-able.
export const isDevMode = (): boolean => import.meta.env.DEV;

// The public Government of Barbados site the forms app belongs under. When set
// (staging/production), visitors to the forms index (`/`) are redirected here
// so they arrive via the proper start page rather than a raw list of forms.
// Left unset locally so developers keep the index list to find/open forms.
// Routed through a function for the same `jest.mock()`-ability reason as above.
export const getHomeUrl = (): string | undefined =>
  import.meta.env.VITE_HOME_URL || undefined;
