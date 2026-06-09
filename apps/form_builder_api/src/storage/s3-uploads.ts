import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION ?? "ca-central-1",
    });
  }
  return client;
}

// presignUpload returns a one-shot 5-minute PUT URL for uploads/<uuid>.pdf in
// the form-builder uploads bucket. Browser uploads directly via this URL,
// bypassing the Amplify SSR Lambda's 6 MB body cap.
export async function presignUpload(): Promise<{ url: string; s3Key: string }> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is not set");
  }
  const s3Key = `uploads/${randomUUID()}.pdf`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: "application/pdf",
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: 300 });
  return { url, s3Key };
}
