import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excludes I, O, 0, 1

function prefixFromFormId(formId: string): string {
  const derived = formId
    .split("-")
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .filter((c) => /[A-Z]/.test(c))
    .join("");
  return derived || "X";
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function dateStr(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function timeStr(d: Date): string {
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function randomTail(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET.charAt(randomInt(0, ALPHABET.length));
  }
  return out;
}

export interface GenerateOptions {
  now?: Date;
  tailLength?: number;
}

export function generateReferenceCode(
  formId: string,
  opts: GenerateOptions = {},
): string {
  const now = opts.now ?? new Date();
  return [
    prefixFromFormId(formId),
    dateStr(now),
    timeStr(now),
    randomTail(opts.tailLength ?? 6),
  ].join("-");
}
