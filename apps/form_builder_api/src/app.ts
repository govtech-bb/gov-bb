import "dotenv/config";
import "reflect-metadata";
import express, { type RequestHandler } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { formsRouter } from "./routes/forms";
import { mdaContactsRouter } from "./routes/mda-contacts";
import { registryRouter } from "./routes/registry";
import { aiRouter } from "./routes/ai";
import { publishRouter } from "./routes/publish";
import { presenceRouter } from "./routes/presence";
import { authMiddleware } from "./middleware/auth";
import { getEnv } from "./config/env";

// Fail fast: validate env at boot (after dotenv/config above) so missing or
// malformed config crashes startup with a readable ZodError instead of failing
// lazily at request time. The read sites below still use process.env directly;
// this call only validates. A bad config crashing boot triggers an ECS
// rollback, which is the intended safe failure — never a half-configured task.
getEnv();

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({ limit: "10mb" }));

// Health check (no auth, no rate limit — registered before the limiter mount).
app.get("/builder/health", (_req, res) => {
  res.json({ ok: true, service: "form-builder-api" });
});

// Generous per-process backstop on every /builder/* route (#930). Mounted
// *before* authMiddleware so it also caps unauthenticated admin-token guessing
// and CodeQL sees a limiter on the path to publishHandler (clears
// js/missing-rate-limiting #6/#9). Buckets are in-memory per process: behind
// the ALB with no `trust proxy`, all authors share one bucket per task, and
// each Fargate task owns its own counters — so the effective ceiling is
// N× this limit. Acceptable as defense-in-depth alongside the AWS WAF
// rate-based rule (see docs/runbooks/aws-security.md); mirrors apps/api's
// throttler posture. Presence syncs ~every 30s (~4 req/min/editor), so the
// 120/min default comfortably fits ~20–30 concurrent editors. Retune via
// BUILDER_RATE_LIMIT rather than widening in code; switch to a shared store
// (Redis) if/when horizontal scaling makes the per-task buckets material.
const builderLimiter = rateLimit({
  windowMs: 60_000,
  limit: parseInt(process.env.BUILDER_RATE_LIMIT ?? "120", 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// All /builder/* routes are rate-limited, then require the admin token. The
// cast bridges a types-only mismatch: express-rate-limit's bundled .d.ts
// resolves the workspace-hoisted @types/express@4, so its handler is typed
// against Express 4's RequestHandler while this app is on Express 5. The
// limiter is a valid Express 5 handler at runtime — only the type identities
// differ — so we re-assert the app's own RequestHandler type.
app.use("/builder", builderLimiter as unknown as RequestHandler);
app.use("/builder", authMiddleware);

// Routes
app.use("/builder/forms", formsRouter);
// Presence routes live under /builder/forms/:formId/presence; their subpaths
// don't collide with formsRouter's /:formId routes, so order is immaterial.
app.use("/builder/forms", presenceRouter);
app.use("/builder/mda-contacts", mdaContactsRouter);
app.use("/builder/registry", registryRouter);
app.use("/builder/ai", aiRouter);
app.use("/builder/publish", publishRouter);
