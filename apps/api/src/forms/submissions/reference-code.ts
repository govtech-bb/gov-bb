import { randomInt } from "node:crypto";

// Crockford Base32: excludes I, L, O, U so the code survives being read aloud
// and retyped. https://www.crockford.com/base32.html
const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TAIL_LENGTH = 7; // 32^7 ≈ 34 billion values per prefix/month

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

/** Year-month as YYMM (UTC). Cosmetic — not a uniqueness guarantee. */
function yearMonth(d: Date): string {
  return `${pad(d.getUTCFullYear() % 100)}${pad(d.getUTCMonth() + 1)}`;
}

function randomTail(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CROCKFORD_BASE32.charAt(randomInt(0, CROCKFORD_BASE32.length));
  }
  return out;
}

export interface GenerateOptions {
  now?: Date;
  /**
   * Explicit prefix (e.g. a CMS programme code like "BYAC"), uppercased. When
   * omitted, the prefix is derived from the formId's segment initials. This is
   * what makes a reference self-identifying and lets a CMS-connected form keep
   * its programme code as the prefix.
   */
  prefix?: string;
  tailLength?: number;
}

/**
 * Generate a human-friendly submission reference:
 *   <PREFIX>-<YYMM>-<RANDOM>   e.g. BYAC-2606-Y5RPJEP
 *
 * Canonical uppercase. Uniqueness comes from the random tail plus the DB unique
 * constraint with retry-on-collision (see SubmissionsService) — never from
 * trusting the randomness alone. The YYMM part is cosmetic.
 */
export function generateReferenceCode(
  formId: string,
  opts: GenerateOptions = {},
): string {
  const now = opts.now ?? new Date();
  const prefix = (opts.prefix ?? prefixFromFormId(formId)).toUpperCase();
  return [
    prefix,
    yearMonth(now),
    randomTail(opts.tailLength ?? TAIL_LENGTH),
  ].join("-");
}

/**
 * Canonical form for *comparing* two reference codes, applying Crockford's
 * decode rules: `O`→`0`, `I`/`L`→`1` (https://www.crockford.com/base32.html).
 *
 * We adopted the Crockford alphabet for the tail but the leading segments are
 * not alphabet-constrained — a derived prefix can contain the letter `O`
 * (`request-an-environmental-health-officer` → `RAEHO`), which is
 * indistinguishable from `RAEH0` on paper or down a phone line. Comparing
 * canonical forms makes a mistyped code resolve anyway.
 *
 * Safe to apply to the whole string: the tail alphabet contains no I/L/O/U and
 * YYMM is digits, so this can only ever rewrite the prefix. Never store the
 * result — it is a comparison key, not a reference code.
 */
export function canonicalizeReferenceCode(code: string): string {
  return code.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
}

/**
 * The `MDA-PROG` reference prefix a form's recipe declares, or `undefined` when
 * it declares none — in which case the prefix falls back to the formId
 * initials, which is what every pre-migration form still does.
 *
 * Read straight off the recipe's webhook mapping, so minting costs no DB read
 * and the prefix is identical in every environment. Both segments are required
 * together: a half-migrated recipe falls back rather than minting a third shape
 * of code.
 */
export function referencePrefixFromProcessors(
  processors: readonly { type: string; config?: unknown }[],
): string | undefined {
  for (const processor of processors) {
    if (processor.type !== "webhook") continue;
    const mapping = (processor.config as { mapping?: unknown } | undefined)
      ?.mapping as
      | { mdaCode?: string; programmeShortCode?: string }
      | undefined;
    if (mapping?.mdaCode && mapping.programmeShortCode) {
      return `${mapping.mdaCode}-${mapping.programmeShortCode}`;
    }
  }
  return undefined;
}
