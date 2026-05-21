import { HttpException, HttpStatus } from "@nestjs/common";
import { isPdfBuffer, pdfFileFilter, PDF_MIME_TYPE } from "./pdf-validation";

describe("isPdfBuffer", () => {
  it("returns true for a buffer starting with %PDF-", () => {
    const buf = Buffer.from("%PDF-1.7\n%âãÏÓ\n");
    expect(isPdfBuffer(buf)).toBe(true);
  });

  it("returns false for a buffer with no %PDF- prefix", () => {
    const buf = Buffer.from("not a pdf at all");
    expect(isPdfBuffer(buf)).toBe(false);
  });

  it("returns false for a buffer shorter than the magic prefix", () => {
    const buf = Buffer.from("%PDF");
    expect(isPdfBuffer(buf)).toBe(false);
  });

  it("returns false for an empty buffer", () => {
    expect(isPdfBuffer(Buffer.alloc(0))).toBe(false);
  });

  it("returns false when %PDF- appears at offset > 0", () => {
    const buf = Buffer.concat([Buffer.from("xxxxx"), Buffer.from("%PDF-1.4")]);
    expect(isPdfBuffer(buf)).toBe(false);
  });
});

describe("pdfFileFilter", () => {
  const fakeReq = {} as never;
  const fakeFile = (mimetype: string) =>
    ({ mimetype, originalname: "x", fieldname: "pdf" }) as Express.Multer.File;

  it("exports PDF_MIME_TYPE as application/pdf", () => {
    expect(PDF_MIME_TYPE).toBe("application/pdf");
  });

  it("calls cb(null, true) for application/pdf", () => {
    const cb = jest.fn();
    pdfFileFilter(fakeReq, fakeFile(PDF_MIME_TYPE), cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it("calls cb(HttpException 415, false) for non-PDF mimetype", () => {
    const cb = jest.fn();
    pdfFileFilter(fakeReq, fakeFile("application/zip"), cb);
    expect(cb).toHaveBeenCalledTimes(1);
    const [err, accept] = cb.mock.calls[0];
    expect(accept).toBe(false);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  });

  it("rejects an empty mimetype the same way", () => {
    const cb = jest.fn();
    pdfFileFilter(fakeReq, fakeFile(""), cb);
    const [err, accept] = cb.mock.calls[0];
    expect(accept).toBe(false);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  });
});
