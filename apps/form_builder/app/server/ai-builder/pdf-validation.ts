/// <reference types="multer" />
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Request } from "express";

export const PDF_MIME_TYPE = "application/pdf";

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

export function isPdfBuffer(buf: Buffer): boolean {
  return (
    buf.length >= PDF_MAGIC.length &&
    buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
  );
}

export function pdfFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
): void {
  if (file.mimetype !== PDF_MIME_TYPE) {
    cb(
      new HttpException(
        `Only ${PDF_MIME_TYPE} uploads are accepted`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      ),
      false,
    );
    return;
  }
  cb(null, true);
}
