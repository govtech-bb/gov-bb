import { Router } from "express";
import { z } from "zod";
import { aiUploadSchema } from "@govtech-bb/form-builder";
import {
  requireAiAccess,
  issueAiToken,
  documentResource,
} from "../ai/access.js";
import { presignUpload, verifyUpload } from "../storage/s3-uploads.js";
import { startAnalysis, getAnalysisResult } from "../ai/textract.js";

export const aiDocumentsRouter = Router();
aiDocumentsRouter.use("/documents", requireAiAccess);
aiDocumentsRouter.post("/documents/presign", async (req, res) => {
  const file = aiUploadSchema.parse(req.body);
  const signed = await presignUpload(file.type);
  const { subject, origin } = res.locals.ai;
  res.json({
    url: signed.url,
    fields: signed.fields,
    reference: issueAiToken(
      { purpose: "upload", subject, origin, resource: signed.s3Key },
      3600,
    ),
  });
});
aiDocumentsRouter.post("/documents/start", async (req, res) => {
  const { reference } = z
    .object({ reference: z.string().max(4000) })
    .parse(req.body);
  const { subject, origin } = res.locals.ai;
  const s3Key = documentResource(reference, subject, "upload");
  await verifyUpload(s3Key);
  const { jobId } = await startAnalysis(s3Key);
  res.json({
    reference: issueAiToken(
      { purpose: "document", subject, origin, resource: jobId },
      7 * 24 * 3600,
    ),
  });
});
aiDocumentsRouter.post("/documents/status", async (req, res) => {
  const { reference } = z
    .object({ reference: z.string().max(4000) })
    .parse(req.body);
  const jobId = documentResource(reference, res.locals.ai.subject, "document");
  const result = await getAnalysisResult(jobId);
  res.json(
    result.status === "failed"
      ? {
          status: "failed",
          error:
            "The document could not be read. Try an unlocked PDF or a clearer image.",
        }
      : { status: result.status },
  );
});
