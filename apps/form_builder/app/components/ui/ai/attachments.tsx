import { Cancel01Icon } from "hugeicons-react";
import type { AttachmentMetadata } from "./attachment-data";
import { FileThumbnail } from "./file-thumbnail";
import s from "./components.module.css";

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
    <div className={s.fileCard}>
      <FileThumbnail
        file={file}
        name={attachment.name}
        type={attachment.type}
      />
      <span className={s.fileInfo}>
        <strong title={attachment.name}>{attachment.name}</strong>
        <span>
          {attachment.size !== undefined
            ? `${attachment.size < 1024 * 1024 ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`} · `
            : ""}
          {status}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <Cancel01Icon size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
