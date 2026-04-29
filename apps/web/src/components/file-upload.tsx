import React from "react";
import { FileUploadProps } from "@web/types";

export default function FileUpload({
  field,
  sharedProps,
  onFileChange,
  value,
}: FileUploadProps) {
  const [files, setFiles] = React.useState<File[]>(value ?? []);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setFiles(value ?? []);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const currentFiles = e.target.files;
    const picked = currentFiles ? Array.from(currentFiles) : [];
    const updatedFiles = [...files, ...picked];
    setFiles(updatedFiles);
    onFileChange?.(updatedFiles.length ? updatedFiles : null);
    // clear native file input so same file can be re-picked
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleChooseClick = () => inputRef.current?.click();

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const next = prev.slice();
      next.splice(index, 1);
      onFileChange?.(next.length ? next : null);
      return next;
    });
  };

  return (
    <div data-file-upload>
      <label data-file-upload-label>
        <div data-file-upload-instructions>
          <span data-file-upload-title>{field.label ?? "Upload a file"}</span>
          <span data-file-upload-description>
            {field.placeholder ?? "Attach a file"}
          </span>
        </div>

        <input
          {...sharedProps}
          ref={inputRef}
          type="file"
          data-file-upload-input
          onChange={handleInputChange}
        />

        <div data-file-upload-information>
          <button
            type="button"
            data-file-upload-button
            onClick={handleChooseClick}
          >
            Choose file
          </button>
          {/* TODO: Replace with actual file size limit */}
          <span data-file-upload-limit>Max Size: --MB</span>
        </div>
      </label>

      {files.length > 0 && (
        <div data-file-upload-list>
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} data-file-upload-item>
              <span data-file-upload-item-name>{f.name}</span>
              <button
                type="button"
                data-file-upload-remove
                onClick={() => removeFile(i)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
