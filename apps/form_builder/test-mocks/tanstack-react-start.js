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

// Mirror @tanstack/start-fn-stubs' runtime semantics: client-side, the .server
// impl wins once set; otherwise fall back to .client. Tests run in Node, so the
// .server branch is what we want to exercise.
function createIsomorphicFn() {
  function build(fn, serverImpl) {
    const wrapper = (...args) => fn(...args);
    wrapper.server = (nextServerImpl) => build(nextServerImpl, nextServerImpl);
    wrapper.client = (clientImpl) =>
      build(serverImpl != null ? serverImpl : clientImpl, serverImpl);
    return wrapper;
  }
  return build(() => undefined);
}

module.exports = { createServerFn, createMiddleware, createIsomorphicFn };
