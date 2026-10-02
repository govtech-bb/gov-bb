import { randomUUID } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { documentTypes } from "@govtech-bb/form-builder";
import { badRequest } from "../lib/http-error.js";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "ca-central-1",
    });
  }
  return client;
}

// S3 enforces the signed type and size limit before the API verifies the contents.
export const MAX_PDF_BYTES = documentTypes["application/pdf"].maxBytes;

export async function presignUpload(
  type: keyof typeof documentTypes = "application/pdf",
): Promise<{
  url: string;
  fields: Record<string, string>;
  s3Key: string;
}> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is not set");
  }
  const spec = documentTypes[type];
  const s3Key = `uploads/${randomUUID()}.${spec.extension}`;
  const { url, fields } = await createPresignedPost(getClient(), {
    Bucket: bucket,
    Key: s3Key,
    Conditions: [
      ["content-length-range", 1, spec.maxBytes],
      ["eq", "$Content-Type", type],
    ],
    Fields: { "Content-Type": type },
    Expires: 300,
  });
  return { url, fields, s3Key };
}

export function hasDocumentSignature(bytes: Uint8Array, type: string): boolean {
  if (type === "application/pdf")
    return Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
  if (type === "image/png")
    return Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  return (
    type === "image/jpeg" &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  );
}

export async function verifyUpload(s3Key: string): Promise<void> {
  if (!/^uploads\/[a-f0-9-]+\.(pdf|png|jpg)$/.test(s3Key))
    throw badRequest("Invalid upload reference.");
  const Bucket = process.env.S3_BUCKET;
  const metadata = await getClient().send(
    new HeadObjectCommand({ Bucket, Key: s3Key }),
  );
  const type = metadata.ContentType as keyof typeof documentTypes;
  const spec = documentTypes[type];
  if (
    !spec ||
    !metadata.ContentLength ||
    metadata.ContentLength > spec.maxBytes ||
    !s3Key.endsWith("." + spec.extension)
  )
    throw badRequest("The uploaded file type or size is invalid.");
  const object = await getClient().send(
    new GetObjectCommand({ Bucket, Key: s3Key, Range: "bytes=0-7" }),
  );
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes || !hasDocumentSignature(bytes, type))
    throw badRequest("The file contents do not match its type.");
}
