import { nativeField } from "../../native";
import { createElement } from "react";
import { UploadSimple } from "@phosphor-icons/react";

import { defineField } from "../../field";
import type { Settings } from "../../core/settings";

import { DEFAULT_FILE_TYPES, fileTypesOf } from "./files";

export type FileUploadSettings = { required: boolean; types: string[]; maxSize?: number };

export const readFileUploadSettings = (raw: Settings): FileUploadSettings => ({
  required: !!raw.required,
  types: fileTypesOf(raw),
  maxSize: raw.hasMaxFileSize && typeof raw.maxFileSize === "number" ? raw.maxFileSize : undefined,
});

export const fileUploadField = defineField({
  native: nativeField("file-upload", { kind: "file", valueType: "file[]" }),
  kind: "file-upload",
  icon: createElement(UploadSimple),
  label: "File upload",
  untitled: "Unlabelled file upload",
  gutterOffset: 22,
  source: {
    storage: {
      type: "widget",
      property: "widget",
      value: "file-upload",
      defaultValue: "page-break",
    },
  },
  settings: {
    read: readFileUploadSettings,
    defaults: { required: true, allowedFiles: [...DEFAULT_FILE_TYPES] },
  },
  capabilities: {
    hideLabel: false,
    repeat: false,
    formula: false,
    mention: false,
    comparisons: ["IS_EMPTY", "IS_NOT_EMPTY"],
  },
  validate: (_settings, raw, where) =>
    Array.isArray(raw.allowedFiles) && raw.allowedFiles.length
      ? []
      : [{ code: "file-types", message: "Choose at least one allowed file type", where }],
});
