/**
 * Lint the polyclinic contact list that landing service pages restate (#2721).
 *
 * The seven Environmental Health Office contacts have one source of truth:
 * `POLYCLINIC_CONTACTS` in `@govtech-bb/form-conditions`, which the
 * confirmation page and the applicant's email render from (via the
 * `{polyclinicContact}` token). Fourteen landing service pages restate the
 * same list as a markdown bullet run under "Need assistance", and by #2721
 * four names had drifted there — "Randall Phillips", "Winston Scott" without
 * its "Sir", "St. Phillip" and "Health and Social Services Complex" — so an
 * applicant read one spelling on the page and another in the email for the
 * same office. Nothing compared the two, so the drift only surfaced in a
 * manual review. These guards close that gap on the trunk.
 *
 *  - `checkPolyclinicContactBlock` finds the bullet run by the `tel:` hrefs,
 *    the one part of each line that never drifted, so a line whose NAME is
 *    wrong is still found and reported instead of silently skipped. The run is
 *    then compared byte for byte against `ALL_POLYCLINIC_CONTACTS_MARKDOWN`,
 *    the exact text the email renders, so one equality check catches a
 *    misspelled name, a `:` where the canonical line uses ` - `, a phone
 *    number missing its `(246)` and a run in the wrong order at once. Only
 *    the list marker is normalised first: the files use both `- ` and `-   `,
 *    and that indentation is invisible once rendered, so it is deliberately
 *    left alone rather than failed on.
 *  - `checkNoSupersededNames` scans the whole text for the four superseded
 *    spellings, so a wrong name in a heading, a sentence or a recipe string is
 *    caught too, not only one inside a contact block. Recipes render the list
 *    through the token rather than restating it, so this is the only rule that
 *    applies to them; it guards the form-builder republish path, which
 *    regenerates a recipe from builder state and could carry a hardcoded name
 *    back in.
 *
 * Both are pure: they take text and return human-readable violation strings
 * (empty when clean). `scripts/validate-content-names.ts` walks the files and
 * is the gate, run by the always-run "Validate Recipes" CI job. A vitest spec
 * cannot be that gate: `nx affected` scopes a landing content edit to
 * `landing` alone, so `scripts:test` never runs on the very PR shape this
 * exists to catch — the same hole `recipe-ref-guards.ts` records behind #504.
 */
import {
  ALL_POLYCLINIC_CONTACTS_MARKDOWN,
  POLYCLINIC_CONTACTS,
} from "@govtech-bb/form-conditions";

/**
 * The spellings #2721 corrected, each with the pattern that finds it. The
 * patterns are written out rather than derived from the pair: only "Winston
 * Scott Polyclinic" needs a guard (it is the canonical name once "Sir "
 * precedes it), and one lookbehind does not earn a generator. The canonical
 * spellings are restated here, so the spec checks each still occurs in a
 * `POLYCLINIC_CONTACTS` key — that table was renamed once already (#254), and
 * a stale entry here would recommend a spelling the email no longer uses.
 */
export const SUPERSEDED_POLYCLINIC_NAMES: readonly {
  superseded: string;
  canonical: string;
  pattern: RegExp;
}[] = [
  {
    superseded: "Randall Phillips",
    canonical: "Randal Phillips",
    pattern: /Randall Phillips/g,
  },
  {
    superseded: "Winston Scott Polyclinic",
    canonical: "Sir Winston Scott Polyclinic",
    pattern: /(?<!Sir )Winston Scott Polyclinic/g,
  },
  {
    superseded: "St. Phillip",
    canonical: "St. Philip",
    pattern: /St\. Phillip/g,
  },
  {
    superseded: "Health and Social Services Complex",
    canonical: "Health & Social Services Complex",
    pattern: /Health and Social Services Complex/g,
  },
];

const TEL_HREF = /\(tel:([+\d]+)\)/;
const LIST_MARKER = /^\s*-\s+/;

function telOf(line: string): string | null {
  return TEL_HREF.exec(line)?.[1] ?? null;
}

/** Canonical clinic name keyed by the phone number in its `tel:` href. */
const CLINIC_BY_TEL = new Map<string, string>();
for (const [name, line] of Object.entries(POLYCLINIC_CONTACTS)) {
  const tel = telOf(line);
  if (tel !== null) CLINIC_BY_TEL.set(tel, name);
}

/**
 * 0-based indices of the lines `checkPolyclinicContactBlock` compares: every
 * line from the first bullet carrying a canonical EHO `tel:` href to the last,
 * inclusive, or `[]` when fewer than two such bullets exist. Exported so the
 * script can count how many pages carry a block without restating that rule.
 *
 * Only bullets anchor the block, and it takes two of them. One is a citation
 * — "Call Sir Winston Scott Polyclinic on …" in prose, or a single bullet —
 * and an author must not have to restate all seven to name one office;
 * `checkNoSupersededNames` still governs its spelling. Two or more is a list
 * that means to be the canonical one, so it is held to all of it.
 *
 * The span is closed, not just the anchors, so a bullet whose phone number is
 * mis-dialled (and therefore anchors nothing) is still compared in place and
 * reported as the line mismatch it is, rather than making the run look split.
 */
export function findPolyclinicContactLines(markdown: string): number[] {
  const anchors: number[] = [];
  markdown.split(/\r?\n/).forEach((line, i) => {
    const tel = telOf(line);
    if (LIST_MARKER.test(line) && tel !== null && CLINIC_BY_TEL.has(tel)) {
      anchors.push(i);
    }
  });
  if (anchors.length < 2) return [];

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  return Array.from({ length: last - first + 1 }, (_, k) => first + k);
}

export function checkPolyclinicContactBlock(
  markdown: string,
  file: string,
): string[] {
  const lines = markdown.split(/\r?\n/);
  const span = findPolyclinicContactLines(markdown);
  if (span.length === 0) return [];

  const first = span[0];
  const last = span[span.length - 1];
  const gap = span.find((i) => !LIST_MARKER.test(lines[i]));
  if (gap !== undefined) {
    return [
      `${file}:${gap + 1}: the polyclinic contact lines are not one contiguous bullet run (lines ${first + 1}–${last + 1} carry the run, and this line is not a bullet) — keep the list together`,
    ];
  }

  const actual = span.map((i) => lines[i].replace(LIST_MARKER, "- "));
  if (actual.join("\n") === ALL_POLYCLINIC_CONTACTS_MARKDOWN) return [];

  const expected = ALL_POLYCLINIC_CONTACTS_MARKDOWN.split("\n");
  const errors: string[] = [];

  if (actual.length !== expected.length) {
    const seen = span.map((i) => telOf(lines[i]));
    const missing: string[] = [];
    const duplicated: string[] = [];
    for (const [tel, name] of CLINIC_BY_TEL) {
      const n = seen.filter((t) => t === tel).length;
      if (n === 0) missing.push(name);
      if (n > 1) duplicated.push(name);
    }
    const detail = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
      duplicated.length > 0 ? `duplicated: ${duplicated.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    errors.push(
      `${file}: found ${actual.length} polyclinic contact bullet(s), expected ${expected.length} (${detail})`,
    );
  }

  // -1 only when the run is a strict prefix of the canonical list, which the
  // count message above already explains.
  const at = actual.findIndex((line, i) => line !== expected[i]);
  if (at >= 0) {
    const want =
      at < expected.length
        ? `"${expected[at]}"`
        : "nothing (the canonical list ends before this line)";
    errors.push(
      `${file}:${span[at] + 1}: polyclinic contact line does not match POLYCLINIC_CONTACTS (packages/form-conditions) — expected ${want} but found "${actual[at]}"`,
    );
  }

  return errors;
}

export function checkNoSupersededNames(text: string, file: string): string[] {
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const {
      superseded,
      canonical,
      pattern,
    } of SUPERSEDED_POLYCLINIC_NAMES) {
      for (const _ of line.matchAll(pattern)) {
        errors.push(
          `${file}:${i + 1}: superseded polyclinic name "${superseded}" — use "${canonical}"`,
        );
      }
    }
  });
  return errors;
}
