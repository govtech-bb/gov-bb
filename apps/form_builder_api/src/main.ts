import "dotenv/config";
import "reflect-metadata";
import express from "express";
import cors from "cors";
import { formsRouter } from "./routes/forms";
import { mdaContactsRouter } from "./routes/mda-contacts";
import { registryRouter } from "./routes/registry";
import { aiRouter } from "./routes/ai";
import { publishRouter } from "./routes/publish";
import { authMiddleware } from "./middleware/auth";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3003", 10);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({ limit: "10mb" }));

// Health check (no auth)
app.get("/builder/health", (_req, res) => {
  res.json({ ok: true, service: "form-builder-api" });
});

// All /builder/* routes require admin token
app.use("/builder", authMiddleware);

// Routes
app.use("/builder/forms", formsRouter);
app.use("/builder/mda-contacts", mdaContactsRouter);
app.use("/builder/registry", registryRouter);
app.use("/builder/ai", aiRouter);
app.use("/builder/publish", publishRouter);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Form Builder API listening on port ${PORT}`);
});
