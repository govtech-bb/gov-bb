// Minimal createServerFn shim for Jest (CJS-compatible).
// The real implementation wraps handlers in an RPC transport layer.
// In tests we just want the handler fn to be called directly.

function createServerFn(_opts) {
  const api = {
    inputValidator: (_schema) => api,
    middleware: (_mw) => api,
    handler: (fn) => {
      // Return a callable that accepts opts and delegates to the handler.
      // Shape mirrors what TanStack Start passes: fn({ data }).
      const callable = (opts) => fn(opts);
      callable.handler = fn;
      return callable;
    },
  };
  return api;
}

function createMiddleware(_opts) {
  return {
    server: (_fn) => undefined,
  };
}

module.exports = { createServerFn, createMiddleware };
