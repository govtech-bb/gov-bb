import type { DatabaseSync } from "node:sqlite";
import express, { type Express, type ErrorRequestHandler } from "express";
import { createPagesRouter } from "./pages/route.js";

export function createApp(db: DatabaseSync): Express {
  const app = express();

  app.use(createPagesRouter(db));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    res.status(err.status ?? 500).json({ error: err.message });
  };
  app.use(errorHandler);

  return app;
}
