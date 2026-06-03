import type { RuleRunner } from "../types";

interface FileEntry {
  name: string;
  size: number;
  type?: string;
}

const toFiles = (v: unknown): FileEntry[] =>
  Array.isArray(v) ? (v as FileEntry[]) : [];

// The bare, dotless, lowercase extension of a filename ("doc.PDF" -> "pdf").
const extOf = (name: string): string => {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : "";
};

// An allowed entry may be authored as a MIME type ("application/pdf"), a dotted
// extension (".pdf"), or a bare extension ("pdf"). Reduce it to a bare dotless
// token so it can be compared against a file's extension regardless of how the
// recipe wrote it.
const toBareExt = (allowed: string): string => {
  const lower = allowed.toLowerCase();
  if (lower.includes("/")) return lower.slice(lower.indexOf("/") + 1); // MIME subtype
  return lower.startsWith(".") ? lower.slice(1) : lower;
};

export const fileTypesRunner: RuleRunner = (value, config) => {
  const allowed = config.value as string[];
  if (!Array.isArray(allowed)) return null;
  const msg = config.error ?? `Allowed file types: ${allowed.join(", ")}`;
  // A file is accepted when its extension matches an allowed entry (after
  // normalising MIME / dotted / dotless forms to a bare extension) OR its
  // browser-reported MIME type matches an allowed MIME entry verbatim. Matching
  // the extension covers the common case where `file.type` is empty.
  const allowedExts = new Set(allowed.map(toBareExt));
  const allowedMimes = new Set(allowed.map((t) => t.toLowerCase()));
  for (const file of toFiles(value)) {
    const ext = extOf(file.name);
    const mime = (file.type ?? "").toLowerCase();
    if (!allowedExts.has(ext) && !(mime !== "" && allowedMimes.has(mime))) {
      return msg;
    }
  }
  return null;
};

export const itemMaxSizeRunner: RuleRunner = (value, config) => {
  const maxBytes = config.value as number;
  const msg = config.error ?? `Each file must be at most ${maxBytes} bytes`;
  for (const file of toFiles(value)) {
    if (file.size > maxBytes) return msg;
  }
  return null;
};

export const maxSizeRunner: RuleRunner = (value, config) => {
  const maxBytes = config.value as number;
  const msg =
    config.error ?? `Total file size must be at most ${maxBytes} bytes`;
  const total = toFiles(value).reduce((sum, f) => sum + f.size, 0);
  return total <= maxBytes ? null : msg;
};
