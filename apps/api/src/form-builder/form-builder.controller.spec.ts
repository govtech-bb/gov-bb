import { HttpException, HttpStatus } from "@nestjs/common";
import { FormBuilderController } from "./form-builder.controller";

describe("FormBuilderController.sendMessage", () => {
  const service = {
    sendMessage: jest.fn().mockResolvedValue({
      sessionId: "s1",
      messages: [],
      recipe: null,
    }),
  };
  const ai = { isAvailable: jest.fn().mockReturnValue(true) };

  const makeController = () =>
    new FormBuilderController(service as never, ai as never);

  const makePdfFile = (header = "%PDF-1.7\n"): Express.Multer.File =>
    ({
      fieldname: "pdf",
      originalname: "doc.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from(header + "rest of file"),
      size: 24,
    }) as Express.Multer.File;

  beforeEach(() => jest.clearAllMocks());

  it("forwards a base64 PDF when the buffer has valid magic bytes", async () => {
    const file = makePdfFile();
    await makeController().sendMessage("s1", "hello", file);
    expect(service.sendMessage).toHaveBeenCalledWith("s1", "hello", [
      file.buffer.toString("base64"),
    ]);
  });

  it("succeeds with no file (text-only message)", async () => {
    await makeController().sendMessage("s1", "hello", undefined);
    expect(service.sendMessage).toHaveBeenCalledWith("s1", "hello", undefined);
  });

  it("throws 400 when uploaded buffer lacks %PDF- magic bytes", async () => {
    const file = makePdfFile("PK\x03\x04"); // ZIP header, MIME-spoofed
    const ctl = makeController();
    await expect(ctl.sendMessage("s1", "hello", file)).rejects.toBeInstanceOf(
      HttpException,
    );
    try {
      await ctl.sendMessage("s1", "hello", file);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
    expect(service.sendMessage).not.toHaveBeenCalled();
  });

  it("throws 400 when message is empty (regression)", async () => {
    const ctl = makeController();
    await expect(ctl.sendMessage("s1", "", undefined)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(service.sendMessage).not.toHaveBeenCalled();
  });

  it("throws 503 when AI service is not configured (regression)", async () => {
    ai.isAvailable.mockReturnValueOnce(false);
    const ctl = makeController();
    await expect(
      ctl.sendMessage("s1", "hello", undefined),
    ).rejects.toBeInstanceOf(HttpException);
    try {
      await ctl.sendMessage("s1", "hello", undefined);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    expect(service.sendMessage).not.toHaveBeenCalled();
  });
});
