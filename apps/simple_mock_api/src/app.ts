import type { DatabaseSync } from "node:sqlite";
import express, { type Express, type ErrorRequestHandler } from "express";
import { createPagesRouter } from "./pages/route.js";

export function createApp(db: DatabaseSync): Express {
  const app = express();
  // No ETags: a conditional request would get a 304, which the consumer's
  // per-URL cache never benefits from and would misread as an outage.
  app.set("etag", false);

  app.use(createPagesRouter(db));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    res.status(err.status ?? 500).json({ error: err.message });
  };
  app.use(errorHandler);

  return app;
}
