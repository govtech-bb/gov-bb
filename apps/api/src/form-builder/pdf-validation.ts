const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

export function isPdfBuffer(buf: Buffer): boolean {
  return (
    buf.length >= PDF_MAGIC.length &&
    buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
  );
}
