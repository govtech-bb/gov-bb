module.exports = new Proxy(
  {},
  { get: (_, prop) => (typeof prop === "string" ? prop : undefined) },
);
