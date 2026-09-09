import type { ValidationConfig } from "@govtech-bb/form-types";
import type { RuleRunner, StepScopedValues } from "../types";

interface FileEntry {
  name: string;
  size: number;
  type?: string;
}

/**
 * What a client sends when the browser could not type the file at all — an
 * extensionless scan, an unrecognised document. It means "unknown binary", NOT
 * a claim about the content, so it is never evidence that a file is allowed:
 * an unverified upload has to earn acceptance on its extension instead.
 *
 * Shared so the browser-side pre-check and the API's presign gate agree on
 * which value carries that meaning — if they drift, a file one accepts the
 * other refuses.
 */
export const UNVERIFIED_CONTENT_TYPE = "application/octet-stream";

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

// Typed with `allValues` OPTIONAL rather than as a bare RuleRunner: this rule
// reads nothing from the surrounding form state, and its two direct callers —
// the browser pre-check and the API presign gate — validate a single file with
// no such state to pass. Still assignable where RULE_REGISTRY wants a
// RuleRunner, so the registry keeps calling it with all three.
export const fileTypesRunner: (
  value: unknown,
  config: ValidationConfig,
  allValues?: StepScopedValues,
) => string | null = (value, config) => {
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
