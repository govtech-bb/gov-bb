// Stub for @tanstack/react-start/server — replaced by vi.mock() factory in tests.
// Provides no-op defaults so server code can import these symbols without errors
// when no mock factory is registered.
function getRequestHeaders() {
  return new Headers();
}

function setResponseHeader() {
  // no-op
}

function getRequest() {
  return new Request("http://localhost/");
}

module.exports = { getRequestHeaders, setResponseHeader, getRequest };
