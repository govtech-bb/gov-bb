import { Elevated } from "../surface";
import { Button } from "../button";
import { Cancel01Icon } from "hugeicons-react";
import type { AttachmentMetadata } from "./attachment-data";
import { FileThumbnail } from "./file-thumbnail";

export function AttachmentCard({
  attachment,
  file,
  status = "Text extracted",
  disabled,
  onRemove,
}: {
  attachment: AttachmentMetadata;
  file?: File;
  status?: string;
  disabled?: boolean;
  onRemove?: () => void;
}) {
  return (
    <Elevated
      offset={1}
      shadowLevel={2}
      render={<div />}
      className="mb-2 flex min-inline-0 items-center gap-2.5 rounded-lg p-2"
    >
      <FileThumbnail
        file={file}
        name={attachment.name}
        type={attachment.type}
      />
      <span className="grid min-inline-0 flex-1 gap-1 [&_strong]:truncate [&_strong]:text-[12px] [&_strong]:font-[550] [&>span]:text-[10px] [&>span]:text-ui-default">
        <strong title={attachment.name}>{attachment.name}</strong>
        <span>
          {attachment.size !== undefined
            ? `${attachment.size < 1024 * 1024 ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`} · `
            : ""}
          {status}
        </span>
      </span>
      {onRemove && (
        <Button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          disabled={disabled}
          onClick={onRemove}
          variant="ghost"
          size="sm"
        >
          <Cancel01Icon size={14} aria-hidden="true" />
        </Button>
      )}
    </Elevated>
  );
}
