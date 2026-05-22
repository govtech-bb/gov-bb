// Stub for @tanstack/react-start/server — replaced by jest.mock() factory in tests.
// Provides no-op defaults so server code can import these symbols without errors
// when no mock factory is registered. Tests that care about call args should
// register their own jest.mock factory or spy on the export.
function getRequestHeaders() {
  return new Headers();
}

function setResponseHeader() {
  // no-op
}

module.exports = { getRequestHeaders, setResponseHeader };
