import { Router } from "express";

export const aiRouter = Router();
aiRouter.get("/status", (_req, res) => res.json({ available: true }));
aiRouter.use((_req, res) => {
  res.status(410).json({
    error:
      "This AI endpoint has been replaced. Refresh the editor to use the assistant.",
  });
});
