jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/put"),
}));
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn().mockImplementation((args) => ({ args })),
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { presignUpload } from "./s3-uploads";

const getSignedUrlMock = getSignedUrl as jest.Mock;
const PutObjectCommandMock = PutObjectCommand as unknown as jest.Mock;

describe("presignUpload", () => {
  beforeEach(() => {
    getSignedUrlMock.mockClear();
    PutObjectCommandMock.mockClear();
    process.env.S3_BUCKET = "form-builder-uploads-sandbox-7922";
  });

  it("returns a url and an uploads/<uuid>.pdf key", async () => {
    const result = await presignUpload();
    expect(result.url).toBe("https://signed.example/put");
    expect(result.s3Key).toMatch(/^uploads\/[0-9a-f-]{36}\.pdf$/);
  });

  it("signs a PutObjectCommand with the configured bucket and pdf content type", async () => {
    await presignUpload();
    expect(PutObjectCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "form-builder-uploads-sandbox-7922",
        Key: expect.stringMatching(/^uploads\/[0-9a-f-]{36}\.pdf$/),
        ContentType: "application/pdf",
      }),
    );
  });

  it("uses a 5-minute TTL on the signed URL", async () => {
    await presignUpload();
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 300 }),
    );
  });
});
