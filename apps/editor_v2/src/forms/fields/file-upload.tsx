import { nativeField } from "../native";
import { createElement } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { DEFAULT_FILE_TYPES, fileTypesOf } from "./file-upload-file-types";
import { $createDecoratorField } from "../canvas/field-nodes";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { FileUploadControls } from "./file-upload-controls";
import { FileUpload } from "./file-upload-presentation";
import { defineSetting, jsonObject, replaceRule, ruleLimit } from "../settings/define-setting";

export type FileUploadSettings = { required: boolean; types: string[]; maxSize?: number };

export const readFileUploadSettings = (raw: Settings): FileUploadSettings => ({
  required: !!raw.required,
  types: fileTypesOf(raw),
  maxSize: raw.hasMaxFileSize && typeof raw.maxFileSize === "number" ? raw.maxFileSize : undefined,
});

/**
 * How many files people may upload and how large, kept as validation rules; the file types allowed, kept as the
 * fileTypes rule; and whether they may choose several at once, kept as the native config's multiple.
 */
const fileUploadSettings = [
  ruleLimit("hasMinFiles", "minFiles", "minFiles"),
  ruleLimit("hasMaxFiles", "maxFiles", "maxFiles"),
  ruleLimit("hasMaxFileSize", "maxFileSize", "maxFileSize", { unit: "MB" }),
  defineSetting({
    keys: ["allowedFiles"],
    read(question): Settings {
      const rule = question.validation?.findLast((item) => item.type === "fileTypes");

      return rule?.type === "fileTypes" ? { allowedFiles: rule.value } : {};
    },
    write(draft, _patch, merged) {
      replaceRule(
        draft,
        "fileTypes",
        Array.isArray(merged.allowedFiles) && merged.allowedFiles.length
          ? { value: merged.allowedFiles }
          : undefined,
      );
    },
  }),
  defineSetting({
    keys: ["hasMultipleFiles"],
    read: (question): Settings => {
      const multiple = jsonObject(question.config).multiple;

      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The settings panel retains the draft file-selection flag; native export validates its boolean contract.
      return multiple === undefined ? {} : { hasMultipleFiles: multiple as boolean };
    },
    write: (draft, patch) => {
      draft.question.config = {
        ...jsonObject(draft.question.config),
        multiple: patch.hasMultipleFiles === true,
      };
    },
  }),
];

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
    own: fileUploadSettings,
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

export const fileUploadInsertion: FieldInsertion = {
  id: "FILE_UPLOAD",
  order: 8,
  keywords: "document",
  create: () => [$createDecoratorField("file-upload", fileUploadField.defaults)],
  question: {
    description:
      "People attach a document, such as proof of address. Only ask for files the service needs, never ‘just in case’.",
    label: "Proof of address",
    hint: "A recent utility bill or bank statement",
  },
  answer: {
    description:
      "A file upload with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "A recent utility bill or bank statement",
  },
};

export const fileUploadEntry = {
  id: fileUploadInsertion.id,
  title: fileUploadField.label,
  icon: fileUploadField.icon,
  kind: fileUploadField.kind,
  keywords: fileUploadInsertion.keywords,
  create: fileUploadInsertion.create,
  description: fileUploadInsertion.answer.description,
  sample: { hint: fileUploadInsertion.answer.hint },
};

export const FileUploadModule = () =>
  fieldModule({
    field: fileUploadField,
    insertion: fileUploadInsertion,
    Controls: FileUploadControls,
    Preview: () => <FileUpload settings={fileUploadField.defaults} />,
    Renderer: FileUpload,
  });
