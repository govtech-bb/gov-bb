import { Test, TestingModule } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

describe("FilesController", () => {
  let controller: FilesController;
  let svc: { presignUpload: jest.Mock; confirmUpload: jest.Mock };

  beforeEach(async () => {
    svc = { presignUpload: jest.fn(), confirmUpload: jest.fn() };
    const mod: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: FilesService, useValue: svc }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = mod.get(FilesController);
  });

  it("presign-upload delegates", async () => {
    svc.presignUpload.mockResolvedValue({
      uploadUrl: "u",
      key: "k",
      expiresIn: 1,
      maxSize: 2,
    });
    const r = await controller.presignUpload({
      formId: "f",
      formVersion: "1.0.0",
      stepId: "s",
      fieldId: "fi",
      fileName: "x.pdf",
      contentType: "application/pdf",
      size: 1,
    });
    expect(r.status).toBe("success");
    expect(r.data.uploadUrl).toBe("u");
  });

  it("confirm-upload delegates", async () => {
    svc.confirmUpload.mockResolvedValue({
      key: "k",
      url: "u",
      name: "n",
      size: 1,
      type: "t",
    });
    const r = await controller.confirmUpload({
      key: "k",
      formId: "f",
      formVersion: "1.0.0",
      stepId: "s",
      fieldId: "fi",
    });
    expect(r.status).toBe("success");
    expect(r.data.key).toBe("k");
  });

  it("forwards the x-recipe-preview header to presignUpload", async () => {
    svc.presignUpload.mockResolvedValue({
      uploadUrl: "u",
      key: "k",
      expiresIn: 1,
      maxSize: 2,
    });
    const dto = {
      formId: "f",
      formVersion: "1.0.0",
      stepId: "s",
      fieldId: "fi",
      fileName: "x.pdf",
      contentType: "application/pdf",
      size: 1,
    };
    await controller.presignUpload(dto, "tok");
    expect(svc.presignUpload).toHaveBeenCalledWith(dto, "tok");
  });

  it("forwards the x-recipe-preview header to confirmUpload", async () => {
    svc.confirmUpload.mockResolvedValue({
      key: "k",
      url: "u",
      name: "n",
      size: 1,
      type: "t",
    });
    const dto = {
      key: "k",
      formId: "f",
      formVersion: "1.0.0",
      stepId: "s",
      fieldId: "fi",
    };
    await controller.confirmUpload(dto, "tok");
    expect(svc.confirmUpload).toHaveBeenCalledWith(dto, "tok");
  });
});
