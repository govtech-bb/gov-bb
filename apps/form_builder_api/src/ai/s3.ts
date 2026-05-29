import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const region =
    process.env.S3_REGION ?? process.env.AWS_REGION ?? "ca-central-1";
  // AWS SDK v3 >= 3.726.0 enables default request-integrity protection that
  // bakes a placeholder x-amz-checksum-crc32 into presigned PUT URLs. The
  // browser's fetch() doesn't compute or send a matching checksum header, so
  // S3 either rejects the upload outright or stores the object with a
  // checksum mismatch — and the round-trip back through GetObject silently
  // returned corrupted bytes that Bedrock refused with "Could not process
  // PDF". WHEN_REQUIRED restores the pre-3.726 behavior: only add checksum
  // metadata when the caller asks for it.
  client = new S3Client({
    region,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured");
  return bucket;
}

export async function presignPutObject(opts: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: opts.expiresIn ?? 600,
  });
}

export async function fetchObjectAsBase64(key: string): Promise<string> {
  const out = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!out.Body) throw new Error(`S3 object has no body: ${key}`);
  const bytes = await out.Body.transformToByteArray();
  return Buffer.from(bytes).toString("base64");
}

// Test hook: drop the cached client so tests can re-init with fresh env.
export function __resetS3ClientForTests(): void {
  client = null;
}
