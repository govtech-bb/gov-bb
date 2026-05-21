import { isPdfBuffer } from "./pdf-validation";

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
