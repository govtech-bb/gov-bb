import { randomUUID } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "ca-central-1",
    });
  }
  return client;
}

// Server-side upload ceiling, signed into the POST policy so S3 rejects an
// oversized body outright — the JS check in the client is only a friendly
// early guard, not the enforcement (gov-bb-security#8). Matches the client's
// MAX_PDF_BYTES and the design spec's 20 MB.
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

// presignUpload returns a one-shot 5-minute presigned POST for
// uploads/<uuid>.pdf in the form-builder uploads bucket. The browser uploads
// directly via multipart POST (bypassing the Amplify SSR Lambda's 6 MB body
// cap). Unlike a presigned PUT, the POST policy signs a content-length-range
// condition, so S3 enforces the 20 MB cap regardless of the client.
export async function presignUpload(): Promise<{
  url: string;
  fields: Record<string, string>;
  s3Key: string;
}> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is not set");
  }
  const s3Key = `uploads/${randomUUID()}.pdf`;
  const { url, fields } = await createPresignedPost(getClient(), {
    Bucket: bucket,
    Key: s3Key,
    Conditions: [
      ["content-length-range", 0, MAX_PDF_BYTES],
      ["eq", "$Content-Type", "application/pdf"],
    ],
    Fields: { "Content-Type": "application/pdf" },
    Expires: 300,
  });
  return { url, fields, s3Key };
}
