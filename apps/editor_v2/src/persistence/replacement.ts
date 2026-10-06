import type { DraftReplacement, ReplacementJournal } from "./types";

const nullableText = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

function isJournal(value: unknown): value is ReplacementJournal {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "version" in value &&
    value.version === 1 &&
    "transactionId" in value &&
    typeof value.transactionId === "string" &&
    !!value.transactionId &&
    "prior" in value &&
    !!value.prior &&
    typeof value.prior === "object" &&
    !Array.isArray(value.prior) &&
    "committed" in value.prior &&
    nullableText(value.prior.committed) &&
    "working" in value.prior &&
    nullableText(value.prior.working) &&
    "source" in value.prior &&
    typeof value.prior.source === "string" &&
    "candidate" in value &&
    typeof value.candidate === "string" &&
    (!("original" in value) || value.original === undefined || typeof value.original === "string")
  );
}

/** A malformed journal is recovery evidence too; callers must retain its exact bytes. */
export function readReplacement(bytes: string, committed: string | null): DraftReplacement {
  const value: unknown = JSON.parse(bytes);

  if (!isJournal(value))
    throw Error(
      "The replacement journal is invalid. Download the original recovery record before changing this draft.",
    );
  const journal = value;

  return {
    bytes,
    journal,
    phase:
      committed === journal.candidate
        ? "committed"
        : committed === journal.prior.committed
          ? "uncommitted"
          : "conflict",
  };
}
