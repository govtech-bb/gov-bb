import type { Settings } from "../../core/settings";

export const FILE_TYPES: [mime: string, name: string, extension: string][] = [
  ["application/pdf", "PDF", ".pdf"],
  ["image/jpeg", "JPEG", ".jpg"],
  ["image/png", "PNG", ".png"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word", ".docx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel", ".xlsx"],
];

export const DEFAULT_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const oldFileTypes = new Map([
  ["IMAGES", ["image/jpeg", "image/png"]],
  ["DOCUMENTS", ["application/pdf", FILE_TYPES[3]![0]]],
  ["SPREADSHEETS", [FILE_TYPES[4]![0]]],
]);

export function fileTypesOf(settings: Settings): string[] {
  const allowed = Array.isArray(settings.allowedFiles) ? settings.allowedFiles : [];

  const types = [
    ...new Set(
      allowed.flatMap((value) =>
        typeof value === "string"
          ? (oldFileTypes.get(value) ??
            (FILE_TYPES.some(([mime]) => mime === value) ? [value] : []))
          : [],
      ),
    ),
  ];

  return types.length ? types : [...DEFAULT_FILE_TYPES];
}

export function fileExtensions(types: string[]) {
  const extensions = types.flatMap((type) => FILE_TYPES.find(([mime]) => mime === type)?.[2] ?? []);

  return extensions.length > 1
    ? `${extensions.slice(0, -1).join(", ")} or ${extensions.at(-1)}`
    : (extensions[0] ?? "");
}
