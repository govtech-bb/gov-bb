import React from "react";

export default function FileUpload() {
  return (
    <div data-file-upload>
      <label data-file-upload-label>
        <div data-file-upload-instructions>
          <span>Upload a Police Certificate of Character</span>
          <span>Attach a .pdf, .docx, or .png file</span>
        </div>
        <input type="file" />
        <div data-file-upload-information>
          <span>Choose file</span>
          <span>Maximum size: 25MB</span>
        </div>
      </label>
    </div>
  );
}
