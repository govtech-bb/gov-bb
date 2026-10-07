import type { ImagePart, DocumentPart } from "@tanstack/ai/client";
import { z } from "zod";

export const attachmentMetadataSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(250),
  type: z.enum(["application/pdf", "image/png", "image/jpeg"]).optional(),
  size: z
    .number()
    .nonnegative()
    .max(20 * 1024 * 1024)
    .optional(),
});
export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;

export function attachmentMetadata(
  part: ImagePart | DocumentPart,
): AttachmentMetadata | undefined {
  const metadata = part.metadata;
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("builderAttachment" in metadata)
  )
    return;
  const parsed = attachmentMetadataSchema.safeParse(metadata.builderAttachment);
  return parsed.success ? parsed.data : undefined;
}

export function attachmentPart(
  attachment: AttachmentMetadata,
  source: string,
): ImagePart | DocumentPart {
  return {
    type: attachment.type?.startsWith("image/") ? "image" : "document",
    source: { type: "url", value: source, mimeType: attachment.type },
    metadata: { builderAttachment: attachmentMetadataSchema.parse(attachment) },
  };
}

export function messageAttachments(metadata: unknown): AttachmentMetadata[] {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("builderAttachments" in metadata)
  )
    return [];
  const parsed = z
    .array(attachmentMetadataSchema)
    .max(3)
    .safeParse(metadata.builderAttachments);
  return parsed.success ? parsed.data : [];
}
