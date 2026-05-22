// Stub for @tanstack/react-start/server — replaced by jest.mock() factory in tests.
// Provides a no-op getRequestHeaders so forms.ts can import it without errors
// when no mock factory is registered.
function getRequestHeaders() {
  return new Headers();
}

module.exports = { getRequestHeaders };
