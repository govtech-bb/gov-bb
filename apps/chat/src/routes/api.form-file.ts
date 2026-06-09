import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getServerEnv } from "#/config/env";
import {
  buildFieldIndex,
  fileUploadsEnabled,
  getOrCreateSession,
  withThreadLock,
} from "#/lib/chat/form";
import { getFormDefinition } from "#/lib/chat/form/defs";
import { validateCollectedFile } from "#/lib/chat/form/values";
import { jsonError } from "#/lib/http";

// File-upload broker for in-chat file fields. The browser never talks to the
// forms API (its CORS allowlist excludes the chat origin): presign and confirm
// are proxied server-to-server here, and the confirmed reference — verified by
// the forms API, never client-claimed — is written straight into the form
// session. Only the S3 PUT happens from the browser, against the presigned
// URL. The model is not involved: it just sees the user's "uploaded" message.

const presignSchema = z.object({
  action: z.literal("presign"),
  threadId: z.string().min(1),
  fieldId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

const confirmSchema = z.object({
  action: z.literal("confirm"),
  threadId: z.string().min(1),
  fieldId: z.string().min(1),
  key: z.string().min(1),
});

const bodySchema = z.discriminatedUnion("action", [
  presignSchema,
  confirmSchema,
]);

interface UploadedFileRef {
  key: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

async function postFormsApi<T>(path: string, body: unknown): Promise<T> {
  const env = getServerEnv();
  const res = await fetch(`${env.FORM_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Forms API ${path} → ${res.status}`);
  }
  return ((await res.json()) as { data: T }).data;
}

async function handlePost(request: Request): Promise<Response> {
  if (!fileUploadsEnabled()) {
    return jsonError("File uploads are not enabled", 404);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const session = getOrCreateSession(body.threadId);
  if (!session.slug) {
    return jsonError("No active form for this conversation", 409);
  }
  const slug = session.slug;
  const contract = await getFormDefinition(slug);
  if (!contract) return jsonError("Form definition unavailable", 502);

  const info = buildFieldIndex(contract).get(body.fieldId);
  if (!info || info.field.htmlType !== "file") {
    return jsonError("Not a file field on the active form", 400);
  }

  const common = {
    formId: contract.formId,
    formVersion: contract.version,
    stepId: info.stepId,
    fieldId: body.fieldId,
  };

  if (body.action === "presign") {
    // Reject oversize/wrong-type files with the recipe's own message before
    // an S3 URL is ever minted.
    const error = validateCollectedFile(info.field, {
      name: body.fileName,
      size: body.size,
      type: body.contentType,
    });
    if (error) return jsonError(error, 422);

    const presign = await postFormsApi<{
      uploadUrl: string;
      key: string;
      expiresIn: number;
      maxSize: number;
    }>("/files/presign-upload", {
      ...common,
      fileName: body.fileName,
      contentType: body.contentType,
      size: body.size,
    });
    return Response.json({ data: presign });
  }

  const confirmed = await postFormsApi<UploadedFileRef>(
    "/files/confirm-upload",
    { ...common, key: body.key },
  );
  const { url: _url, ...ref } = confirmed;

  // Serialize against concurrent runTurn writes; refs accumulate so multi-file
  // fields collect across several uploads.
  await withThreadLock(body.threadId, async () => {
    const existing = session.values[body.fieldId];
    const refs: UploadedFileRef[] = existing
      ? (JSON.parse(existing) as UploadedFileRef[])
      : [];
    refs.push(ref);
    session.values[body.fieldId] = JSON.stringify(refs);
    session.updatedAt = Date.now();
  });

  return Response.json({ data: ref });
}

export const Route = createFileRoute("/api/form-file")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handlePost(request);
        } catch (err) {
          console.error("[api.form-file]", err);
          return jsonError("Upload failed. Please try again.", 502);
        }
      },
    },
  },
});
