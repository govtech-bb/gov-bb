import type { RuleRunner } from "../types";

interface FileEntry {
  name: string;
  size: number;
  type?: string;
}

const toFiles = (v: unknown): FileEntry[] =>
  Array.isArray(v) ? (v as FileEntry[]) : [];

const extOf = (name: string): string => {
  const parts = name.split(".");
  return parts.length > 1 ? `.${parts[parts.length - 1]!.toLowerCase()}` : "";
};

export const fileTypesRunner: RuleRunner = (value, config) => {
  const allowed = config.value as string[];
  if (!Array.isArray(allowed)) return null;
  const msg = config.error ?? `Allowed file types: ${allowed.join(", ")}`;
  const normalized = allowed.map((t) => t.toLowerCase());
  for (const file of toFiles(value)) {
    const ext = extOf(file.name);
    if (!normalized.includes(ext) && !normalized.includes(file.type ?? "")) {
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
