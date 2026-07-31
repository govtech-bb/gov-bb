import type { Mock } from "vitest";
vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: vi.fn().mockResolvedValue({
    url: "https://signed.example/post",
    fields: { key: "uploads/x.pdf", "Content-Type": "application/pdf" },
  }),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
}));

import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { presignUpload, MAX_PDF_BYTES } from "./s3-uploads";

const createPresignedPostMock = createPresignedPost as Mock;

describe("presignUpload", () => {
  beforeEach(() => {
    createPresignedPostMock.mockClear();
    process.env.S3_BUCKET = "form-builder-uploads-sandbox-7922";
  });

  it("returns a url, signed fields, and an uploads/<uuid>.pdf key", async () => {
    const result = await presignUpload();
    expect(result.url).toBe("https://signed.example/post");
    expect(result.fields).toMatchObject({ "Content-Type": "application/pdf" });
    expect(result.s3Key).toMatch(/^uploads\/[0-9a-f-]{36}\.pdf$/);
  });

  it("signs a POST policy with the bucket, key, and pdf content type", async () => {
    await presignUpload();
    expect(createPresignedPostMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Bucket: "form-builder-uploads-sandbox-7922",
        Key: expect.stringMatching(/^uploads\/[0-9a-f-]{36}\.pdf$/),
        Fields: expect.objectContaining({ "Content-Type": "application/pdf" }),
      }),
    );
  });

  it("signs a content-length-range condition capping the body at 20 MB", async () => {
    await presignUpload();
    const { Conditions } = createPresignedPostMock.mock.calls[0][1];
    expect(Conditions).toContainEqual([
      "content-length-range",
      0,
      MAX_PDF_BYTES,
    ]);
    expect(MAX_PDF_BYTES).toBe(20 * 1024 * 1024);
  });

  it("uses a 5-minute TTL on the signed policy", async () => {
    await presignUpload();
    expect(createPresignedPostMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ Expires: 300 }),
    );
  });
});
