/**
 * End-to-end happy-path exercise of the presign → PUT → confirm flow.
 *
 * Skipped by default because it boots the full AppModule, which requires
 * a live Postgres. Unskip locally when you want a manual end-to-end check;
 * unit coverage in files.service.spec.ts + submission-pipeline.service.spec.ts
 * exercises the same code paths.
 */

import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { AppModule } from "../../app.module";

const s3Mock = mockClient(S3Client);

describe.skip("File upload integration (needs DB)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.S3_BUCKET = "test-bucket";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  beforeEach(() => s3Mock.reset());
  afterAll(async () => app && app.close());

  it("presign → confirm round-trip", async () => {
    const presign = await request(app.getHttpServer())
      .post("/files/presign-upload")
      .send({
        formId: "passport-renewal",
        formVersion: "1.0.0",
        stepId: "documents",
        fieldId: "policeCertificate",
        fileName: "cert.pdf",
        contentType: "application/pdf",
        size: 1024,
      })
      .expect(201);

    expect(presign.body.data.uploadUrl).toMatch(/^https?:\/\//);
    const key = presign.body.data.key as string;

    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 1024,
      ContentType: "application/pdf",
    });

    const confirm = await request(app.getHttpServer())
      .post("/files/confirm-upload")
      .send({ key })
      .expect(201);

    expect(confirm.body.data.key).toBe(key);
    expect(confirm.body.data.url).toMatch(/^https?:\/\//);
  });

  it("confirm returns 404 when missing", async () => {
    s3Mock.on(HeadObjectCommand).rejects({ name: "NotFound" });
    await request(app.getHttpServer())
      .post("/files/confirm-upload")
      .send({ key: "uploads/no/such" })
      .expect(404);
  });
});
