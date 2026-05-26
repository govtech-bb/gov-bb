import { registerAs } from "@nestjs/config";

export default registerAs("upload", () => ({
  bucket: process.env.S3_BUCKET ?? "",
  region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  maxSizeBytes: parseInt(process.env.UPLOAD_MAX_SIZE_BYTES ?? "10485760", 10),
  presignTtlSeconds: parseInt(
    process.env.UPLOAD_PRESIGN_TTL_SECONDS ?? "900",
    10,
  ),
  readUrlTtlSeconds: parseInt(
    process.env.UPLOAD_READ_URL_TTL_SECONDS ?? "604800",
    10,
  ),
}));
