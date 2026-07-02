import type { Mock } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ServiceContract } from "@govtech-bb/form-types";
import { FilesService } from "./files.service";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";

const s3Mock = mockClient(S3Client);

function makeContract(): ServiceContract {
  return {
    formId: "passport-renewal",
    title: "Passport Renewal",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [
      {
        stepId: "documents",
        title: "Documents",
        elements: [
          {
            fieldId: "policeCertificate",
            label: "Police Certificate",
            htmlType: "file",
            multiple: false,
            validations: {
              fileTypes: { value: [".pdf", "application/pdf"] },
              itemMaxSize: { value: 2 * 1024 * 1024 },
            },
          },
          {
            fieldId: "fullName",
            label: "Full Name",
            htmlType: "text",
          },
        ],
      },
    ],
  } as unknown as ServiceContract;
}

describe("FilesService", () => {
  let service: FilesService;
  let formDefs: { findByFormId: Mock };

  beforeAll(() => {
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
  });

  beforeEach(async () => {
    s3Mock.reset();
    formDefs = {
      findByFormId: vi.fn().mockResolvedValue(makeContract()),
    };

    const cfg: Record<string, unknown> = {
      "upload.bucket": "test-bucket",
      "upload.region": "us-east-1",
      "upload.endpoint": "http://localhost:4566",
      "upload.forcePathStyle": true,
      "upload.maxSizeBytes": 10 * 1024 * 1024,
      "upload.presignTtlSeconds": 900,
      "upload.readUrlTtlSeconds": 604800,
      RECIPE_PREVIEW_TOKEN: "secret-preview-token",
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: ConfigService,
          useValue: { get: (k: string) => cfg[k] },
        },
        { provide: FormDefinitionsService, useValue: formDefs },
      ],
    }).compile();

    service = mod.get(FilesService);
  });

  describe("presignUpload", () => {
    const dto = {
      formId: "passport-renewal",
      formVersion: "1.0.0",
      stepId: "documents",
      fieldId: "policeCertificate",
      fileName: "My Cert.pdf",
      contentType: "application/pdf",
      size: 1024,
    };

    it("returns a presigned URL + scoped key", async () => {
      const r = await service.presignUpload(dto);
      expect(r.uploadUrl).toMatch(/^https?:\/\//);
      // Key embeds the (formId/stepId/fieldId) tuple so confirm can bind to it (#284).
      expect(r.key).toMatch(
        /^uploads\/passport-renewal\/documents\/policeCertificate\/\d{4}\/\d{2}\/[0-9a-f-]+-my_cert\.pdf$/,
      );
      expect(r.expiresIn).toBe(900);
      expect(r.maxSize).toBe(2 * 1024 * 1024);
    });

    it("rejects unknown form", async () => {
      formDefs.findByFormId.mockRejectedValue(new Error("nope"));
      await expect(service.presignUpload(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects unknown step", async () => {
      await expect(
        service.presignUpload({ ...dto, stepId: "nope" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects non-file field", async () => {
      await expect(
        service.presignUpload({ ...dto, fieldId: "fullName" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects disallowed content type", async () => {
      await expect(
        service.presignUpload({
          ...dto,
          contentType: "image/png",
          fileName: "x.png",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects oversize", async () => {
      await expect(
        service.presignUpload({ ...dto, size: 5 * 1024 * 1024 }),
      ).rejects.toThrow(BadRequestException);
    });

    describe("recipe tokens", () => {
      it("resolves with bypassVisibility:true when the preview token is valid", async () => {
        await service.presignUpload(dto, "secret-preview-token");
        expect(formDefs.findByFormId).toHaveBeenCalledWith(
          expect.objectContaining({ bypassVisibility: true, draft: false }),
        );
      });

      it("resolves with draft:true when the draft token is valid", async () => {
        await service.presignUpload(dto, undefined, "secret-preview-token");
        expect(formDefs.findByFormId).toHaveBeenCalledWith(
          expect.objectContaining({ bypassVisibility: false, draft: true }),
        );
      });

      it("resolves with no bypass/draft when no token is supplied", async () => {
        await service.presignUpload(dto);
        expect(formDefs.findByFormId).toHaveBeenCalledWith(
          expect.objectContaining({ bypassVisibility: false, draft: false }),
        );
      });

      it("resolves with no bypass/draft when the token is invalid", async () => {
        await service.presignUpload(dto, "wrong-token", "wrong-token");
        expect(formDefs.findByFormId).toHaveBeenCalledWith(
          expect.objectContaining({ bypassVisibility: false, draft: false }),
        );
      });

      it("presigns a DB-only draft only with a valid draft token", async () => {
        // Simulate an unpublished draft: resolvable only on the draft path.
        formDefs.findByFormId.mockImplementation(
          ({ draft }: { draft?: boolean }) =>
            draft
              ? Promise.resolve(makeContract())
              : Promise.reject(new Error("not found")),
        );
        await expect(service.presignUpload(dto)).rejects.toThrow(
          BadRequestException,
        );
        const r = await service.presignUpload(
          dto,
          undefined,
          "secret-preview-token",
        );
        expect(r.uploadUrl).toMatch(/^https?:\/\//);
      });
    });
  });

  describe("confirmUpload", () => {
    const confirmDto = {
      key: "uploads/passport-renewal/2026/05/abcdef01-2345-6789-abcd-ef0123456789-x.pdf",
      formId: "passport-renewal",
      formVersion: "1.0.0",
      stepId: "documents",
      fieldId: "policeCertificate",
    };

    it("returns FileAttachmentDto on hit", async () => {
      s3Mock.on(HeadObjectCommand).resolves({
        ContentLength: 1234,
        ContentType: "application/pdf",
      });
      const r = await service.confirmUpload(confirmDto);
      expect(r.size).toBe(1234);
      expect(r.type).toBe("application/pdf");
      expect(r.name).toBe("x.pdf");
      expect(r.url).toMatch(/^https?:\/\//);
    });

    it("404s on miss", async () => {
      s3Mock.on(HeadObjectCommand).rejects({ name: "NotFound" });
      await expect(service.confirmUpload(confirmDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects when uploaded blob exceeds field maxSize", async () => {
      s3Mock.on(HeadObjectCommand).resolves({
        ContentLength: 5 * 1024 * 1024,
        ContentType: "application/pdf",
      });
      await expect(service.confirmUpload(confirmDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects when neither extension nor MIME matches the allowlist", async () => {
      s3Mock.on(HeadObjectCommand).resolves({
        ContentLength: 100,
        ContentType: "image/png",
      });
      await expect(
        service.confirmUpload({
          ...confirmDto,
          key: "uploads/passport-renewal/2026/05/abcdef01-2345-6789-abcd-ef0123456789-evil.exe",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    describe("presign↔confirm binding (#284)", () => {
      const boundKey =
        "uploads/passport-renewal/documents/policeCertificate/2026/05/abcdef01-2345-6789-abcd-ef0123456789-x.pdf";

      it("confirms a new-format key whose embedded tuple matches the field", async () => {
        s3Mock.on(HeadObjectCommand).resolves({
          ContentLength: 1234,
          ContentType: "application/pdf",
        });
        const r = await service.confirmUpload({ ...confirmDto, key: boundKey });
        expect(r.size).toBe(1234);
        expect(r.name).toBe("x.pdf");
      });

      it("rejects when the confirmed field differs from the key's embedded tuple", async () => {
        s3Mock.on(HeadObjectCommand).resolves({
          ContentLength: 1234,
          ContentType: "application/pdf",
        });
        // Key was presigned under documents/policeCertificate; confirming under
        // a different step must be rejected before any policy check — this is
        // the escape the binding closes.
        await expect(
          service.confirmUpload({
            ...confirmDto,
            key: boundKey,
            stepId: "other-step",
          }),
        ).rejects.toThrow("Upload key does not match the confirmed field");
      });

      it("falls back to the client tuple for a legacy (tuple-less) key", async () => {
        s3Mock.on(HeadObjectCommand).resolves({
          ContentLength: 1234,
          ContentType: "application/pdf",
        });
        // The default confirmDto.key is the old format — still accepted during
        // rollout, no binding check.
        const r = await service.confirmUpload(confirmDto);
        expect(r.size).toBe(1234);
      });
    });

    describe("recipe tokens", () => {
      beforeEach(() => {
        s3Mock.on(HeadObjectCommand).resolves({
          ContentLength: 1234,
          ContentType: "application/pdf",
        });
      });

      it("resolves with bypassVisibility:true when the preview token is valid", async () => {
        await service.confirmUpload(confirmDto, "secret-preview-token");
        expect(formDefs.findByFormId).toHaveBeenCalledWith(
          expect.objectContaining({ bypassVisibility: true, draft: false }),
        );
      });

      it("resolves with draft:true when the draft token is valid", async () => {
        await service.confirmUpload(
          confirmDto,
          undefined,
          "secret-preview-token",
        );
        expect(formDefs.findByFormId).toHaveBeenCalledWith(
          expect.objectContaining({ bypassVisibility: false, draft: true }),
        );
      });

      it("resolves with no bypass/draft when no token is supplied", async () => {
        await service.confirmUpload(confirmDto);
        expect(formDefs.findByFormId).toHaveBeenCalledWith(
          expect.objectContaining({ bypassVisibility: false, draft: false }),
        );
      });

      it("confirms a DB-only draft only with a valid draft token", async () => {
        formDefs.findByFormId.mockImplementation(
          ({ draft }: { draft?: boolean }) =>
            draft
              ? Promise.resolve(makeContract())
              : Promise.reject(new Error("not found")),
        );
        await expect(service.confirmUpload(confirmDto)).rejects.toThrow(
          BadRequestException,
        );
        const r = await service.confirmUpload(
          confirmDto,
          undefined,
          "secret-preview-token",
        );
        expect(r.size).toBe(1234);
      });
    });
  });

  describe("verifyKeysExist", () => {
    it("returns the set of keys that do NOT exist", async () => {
      s3Mock.on(HeadObjectCommand, { Key: "ok" }).resolves({});
      s3Mock
        .on(HeadObjectCommand, { Key: "missing" })
        .rejects({ name: "NotFound" });
      const r = await service.verifyKeysExist(["ok", "missing"]);
      expect(r).toEqual(new Set(["missing"]));
    });
  });

  describe("verifySubmissionFiles", () => {
    it("flags non-existing keys per step.field, supporting repeatable instances", async () => {
      const contract = makeContract();
      (contract.steps as Array<unknown>).push({
        stepId: "jobs",
        title: "Jobs",
        elements: [
          {
            fieldId: "proof",
            htmlType: "file",
            label: "Proof",
            multiple: true,
            validations: { fileTypes: { value: ["application/pdf"] } },
          },
        ],
      });

      s3Mock.on(HeadObjectCommand, { Key: "ok-key" }).resolves({});
      s3Mock
        .on(HeadObjectCommand, { Key: "bad-key" })
        .rejects({ name: "NotFound" });

      const errors = await service.verifySubmissionFiles(
        FilesService.collectFileFieldsByStep(contract),
        {
          documents: {
            policeCertificate: [
              {
                key: "ok-key",
                url: "u",
                name: "ok.pdf",
                size: 1,
                type: "application/pdf",
              },
            ],
          },
          jobs: [
            {
              proof: [
                {
                  key: "bad-key",
                  url: "u",
                  name: "bad.pdf",
                  size: 1,
                  type: "application/pdf",
                },
              ],
            },
            {
              proof: [
                {
                  key: "ok-key",
                  url: "u",
                  name: "ok2.pdf",
                  size: 1,
                  type: "application/pdf",
                },
              ],
            },
          ],
        },
      );

      expect(errors).toEqual({
        jobs: {
          instances: [{ proof: ["Uploaded file not found"] }, {}],
        },
      });
    });

    it("returns {} when no file fields have keys", async () => {
      const contract = makeContract();
      const errors = await service.verifySubmissionFiles(
        FilesService.collectFileFieldsByStep(contract),
        {
          documents: { fullName: "Jane" },
        },
      );
      expect(errors).toEqual({});
    });

    it("rejects file entries that have no `key` (client skipped confirm-upload)", async () => {
      const contract = makeContract();
      const errors = await service.verifySubmissionFiles(
        FilesService.collectFileFieldsByStep(contract),
        {
          documents: {
            policeCertificate: [
              { name: "x.pdf", size: 1, type: "application/pdf" },
            ],
          },
        },
      );
      expect(errors).toEqual({
        documents: {
          policeCertificate: ["Uploaded file not found"],
        },
      });
    });
  });

  describe("collectFileEntries", () => {
    const fileFields = () =>
      FilesService.collectFileFieldsByStep(makeContract());

    it("collects file entries with their stored metadata", () => {
      const entries = FilesService.collectFileEntries(fileFields(), {
        documents: {
          policeCertificate: [
            {
              key: "uploads/passport-renewal/2026/06/u-cert.pdf",
              name: "cert.pdf",
              size: 1024,
              type: "application/pdf",
            },
          ],
          fullName: "Jane",
        },
      });

      expect(entries).toEqual([
        {
          key: "uploads/passport-renewal/2026/06/u-cert.pdf",
          name: "cert.pdf",
          size: 1024,
          type: "application/pdf",
        },
      ]);
    });

    it("walks repeatable-step instances", () => {
      const entries = FilesService.collectFileEntries(fileFields(), {
        documents: [
          {
            policeCertificate: [
              { key: "k1", name: "a.pdf", size: 1, type: "application/pdf" },
            ],
          },
          {
            policeCertificate: [
              { key: "k2", name: "b.pdf", size: 2, type: "application/pdf" },
            ],
          },
        ],
      });

      expect(entries.map((e) => e.key)).toEqual(["k1", "k2"]);
    });

    it("skips keyless entries and defaults missing metadata", () => {
      const entries = FilesService.collectFileEntries(fileFields(), {
        documents: {
          policeCertificate: [
            { name: "no-key.pdf", size: 1, type: "application/pdf" },
            { key: "uploads/f/2026/06/u-bare.pdf" },
          ],
        },
      });

      expect(entries).toEqual([
        {
          key: "uploads/f/2026/06/u-bare.pdf",
          name: "u-bare.pdf",
          size: 0,
          type: "application/octet-stream",
        },
      ]);
    });

    it("returns [] when the step has no submitted values", () => {
      expect(FilesService.collectFileEntries(fileFields(), {})).toEqual([]);
    });
  });

  describe("getObjectBytes", () => {
    it("returns the object's bytes as a Buffer", async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: {
          transformToByteArray: async () =>
            new Uint8Array(Buffer.from("pdf-bytes")),
        },
      } as never);

      const buf = await service.getObjectBytes("uploads/f/2026/06/u-x.pdf");

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.toString("utf8")).toBe("pdf-bytes");
    });

    it("throws NotFoundException when the object has no body", async () => {
      s3Mock.on(GetObjectCommand).resolves({} as never);

      await expect(service.getObjectBytes("uploads/missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
