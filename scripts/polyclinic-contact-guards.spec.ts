import {
  ALL_POLYCLINIC_CONTACTS_MARKDOWN,
  POLYCLINIC_CONTACTS,
} from "@govtech-bb/form-conditions";
import {
  SUPERSEDED_POLYCLINIC_NAMES,
  checkNoSupersededNames,
  checkPolyclinicContactBlock,
  findPolyclinicContactLines,
} from "./polyclinic-contact-guards";

// The block fixtures are built from the canonical table rather than restated,
// so they cannot drift from it the way the content did. The superseded-name
// table DOES restate canonical spellings; the integrity test at the end is
// what holds it to POLYCLINIC_CONTACTS.
const CANONICAL = ALL_POLYCLINIC_CONTACTS_MARKDOWN;
const CANONICAL_LINES = CANONICAL.split("\n");

/** Wrap a bullet run in the prose that surrounds it on a real service page. */
function page(block: string): string {
  return [
    "---",
    "title: Apply for a licence",
    "---",
    "",
    "## Need assistance",
    "",
    "If you need help, contact the Environmental Health Service office for your area.",
    "",
    block,
    "",
    "Submitting an application does not mean a licence has been granted.",
    "",
  ].join("\n");
}
// `page()` puts the block's first line on line 9.
const BLOCK_START = 9;

/**
 * Mutate the canonical block, failing loudly when `from` is not in it so a
 * fixture cannot silently stop exercising its failure mode.
 */
function mutate(from: string, to: string): string {
  if (!CANONICAL.includes(from)) {
    throw new Error(`fixture: "${from}" is not in the canonical block`);
  }
  return CANONICAL.replace(from, to);
}

describe("checkPolyclinicContactBlock", () => {
  it("passes a page restating the canonical block", () => {
    expect(checkPolyclinicContactBlock(page(CANONICAL), "p.md")).toEqual([]);
  });

  it("passes a page with no contact block", () => {
    const prose = page("Call us on [(246) 535-0000](tel:+12465350000).");
    expect(checkPolyclinicContactBlock(prose, "p.md")).toEqual([]);
  });

  // One office named in prose is a citation, not a restated list; the author
  // must not be made to restate all seven. Only checkNoSupersededNames applies.
  it("passes a single clinic cited in prose with its canonical tel: href", () => {
    const prose = page(
      "Call Sir Winston Scott Polyclinic on [(246) 536-3476](tel:+12465363476).",
    );
    expect(findPolyclinicContactLines(prose)).toEqual([]);
    expect(checkPolyclinicContactBlock(prose, "p.md")).toEqual([]);
  });

  it("passes a single canonical bullet on its own", () => {
    const one = page(CANONICAL_LINES[5]);
    expect(checkPolyclinicContactBlock(one, "p.md")).toEqual([]);
  });

  // A strict prefix of the canonical list has no mismatched line, so only the
  // count message fires.
  it("treats two canonical bullets as a block and holds them to all seven", () => {
    const two = page(CANONICAL_LINES.slice(0, 2).join("\n"));
    const errors = checkPolyclinicContactBlock(two, "p.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      "found 2 polyclinic contact bullet(s), expected 7",
    );
    expect(errors[0]).toContain("missing: Eunice Gibson Polyclinic");
  });

  // 10 of the 14 live pages indent with `-   `; the rendered list is identical.
  it("passes the 3-space list marker just like the 1-space one", () => {
    const indented = CANONICAL_LINES.map((l) => l.replace(/^- /, "-   ")).join(
      "\n",
    );
    expect(indented).not.toBe(CANONICAL);
    expect(checkPolyclinicContactBlock(page(indented), "p.md")).toEqual([]);
  });

  it("flags a misspelled clinic name", () => {
    const block = mutate("Randal Phillips", "Randall Phillips");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`p.md:${BLOCK_START + 4}:`);
    expect(errors[0]).toContain('expected "- Randal Phillips Polyclinic');
    expect(errors[0]).toContain('found "- Randall Phillips Polyclinic');
  });

  it("flags a ':' separator where the canonical line uses ' - '", () => {
    const block = mutate("Polyclinic - [", "Polyclinic: [");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('found "- Branford Taitt Polyclinic: [');
  });

  it("flags a phone number missing its (246) prefix", () => {
    const block = mutate("[(246) 536-3700]", "[536-3700]");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("[536-3700](tel:+12465363700)");
  });

  // A mis-dialled href anchors nothing, so before the span was closed this
  // bullet vanished from the run and the other six read as split by "other
  // content" — sending the author hunting for prose that was not there.
  it("flags a mis-dialled tel: href in a middle bullet as a line mismatch, not a split run", () => {
    const block = mutate("tel:+12465363214", "tel:+12465363241");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`p.md:${BLOCK_START + 3}:`);
    expect(errors[0]).toContain('expected "- Maurice Byer Polyclinic');
    expect(errors[0]).toContain('found "- Maurice Byer Polyclinic');
    expect(errors[0]).toContain("tel:+12465363241");
    expect(errors[0]).not.toContain("contiguous");
  });

  it("flags two clinics swapped out of canonical order", () => {
    const [a, b, ...rest] = CANONICAL_LINES;
    const block = [b, a, ...rest].join("\n");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`p.md:${BLOCK_START}:`);
    expect(errors[0]).toContain(`expected "${a}"`);
    expect(errors[0]).toContain(`found "${b}"`);
  });

  it("flags a missing clinic and names it", () => {
    const block = CANONICAL_LINES.filter(
      (l) => !l.startsWith("- Maurice Byer"),
    ).join("\n");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain(
      "found 6 polyclinic contact bullet(s), expected 7",
    );
    expect(errors[0]).toContain("missing: Maurice Byer Polyclinic");
    expect(errors[1]).toContain('expected "- Maurice Byer Polyclinic');
  });

  it("flags a duplicated clinic and names it", () => {
    const block = [
      ...CANONICAL_LINES.slice(0, 4),
      ...CANONICAL_LINES.slice(3),
    ].join("\n");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain(
      "found 8 polyclinic contact bullet(s), expected 7",
    );
    expect(errors[0]).toContain("(duplicated: Maurice Byer Polyclinic)");
    expect(errors[1]).toContain(`p.md:${BLOCK_START + 4}:`);
    expect(errors[1]).toContain('expected "- Randal Phillips Polyclinic');
  });

  it("flags contact lines split by other content instead of concatenating them", () => {
    const block = [
      ...CANONICAL_LINES.slice(0, 3),
      "",
      "Some other paragraph.",
      "",
      ...CANONICAL_LINES.slice(3),
    ].join("\n");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`p.md:${BLOCK_START + 3}:`);
    expect(errors[0]).toContain("not one contiguous bullet run");
  });

  // A canonical tel: on a line with no list marker is prose, not an anchor —
  // but inside the run it still breaks it.
  it("flags a bullet that lost its list marker as breaking the run", () => {
    const block = mutate("- Maurice Byer", "Maurice Byer");
    const errors = checkPolyclinicContactBlock(page(block), "p.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`p.md:${BLOCK_START + 3}:`);
    expect(errors[0]).toContain("not one contiguous bullet run");
  });
});

describe("checkNoSupersededNames", () => {
  it("flags a superseded name in prose with its line and replacement", () => {
    const text =
      "Intro.\n\nVisit the Randall Phillips Polyclinic to collect it.";
    expect(checkNoSupersededNames(text, "p.md")).toEqual([
      'p.md:3: superseded polyclinic name "Randall Phillips" — use "Randal Phillips"',
    ]);
  });

  it("does not report Sir Winston Scott Polyclinic", () => {
    const text = "Collect it from Sir Winston Scott Polyclinic.";
    expect(checkNoSupersededNames(text, "p.md")).toEqual([]);
  });

  it("does not report the canonical St. Philip as St. Phillip", () => {
    expect(checkNoSupersededNames("St. Philip Polyclinic", "p.md")).toEqual([]);
  });

  // The match is a plain substring, so a superseded spelling wrapped in a
  // longer, still-wrong string is still caught — and only "Sir " exempts
  // "Winston Scott Polyclinic".
  it("flags a superseded spelling embedded in a longer, still-wrong string", () => {
    const errors = checkNoSupersededNames(
      "St. Phillips Polyclinic and the Winston Scott Polyclinic",
      "p.md",
    );
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toContain('"St. Phillip" — use "St. Philip"');
    expect(errors.join("\n")).toContain(
      '"Winston Scott Polyclinic" — use "Sir Winston Scott Polyclinic"',
    );
  });

  it("passes the canonical block itself", () => {
    expect(checkNoSupersededNames(CANONICAL, "p.md")).toEqual([]);
  });

  it.each(SUPERSEDED_POLYCLINIC_NAMES)(
    'detects "$superseded" and names "$canonical"',
    ({ superseded, canonical }) => {
      const errors = checkNoSupersededNames(
        `## Contact the ${superseded}`,
        "p.md",
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`"${superseded}"`);
      expect(errors[0]).toContain(`"${canonical}"`);
    },
  );

  it("reports every occurrence", () => {
    const text = "St. Phillip first.\nSt. Phillip again, and Randall Phillips.";
    expect(checkNoSupersededNames(text, "p.md")).toHaveLength(3);
  });
});

// POLYCLINIC_CONTACTS was renamed once already (#254). If it is renamed again,
// checkPolyclinicContactBlock goes loudly red on every page, but
// checkNoSupersededNames would keep recommending a now-stale spelling unless
// this holds.
describe("SUPERSEDED_POLYCLINIC_NAMES", () => {
  it.each(SUPERSEDED_POLYCLINIC_NAMES)(
    'recommends "$canonical", which is still part of a POLYCLINIC_CONTACTS name',
    ({ canonical }) => {
      const names = Object.keys(POLYCLINIC_CONTACTS);
      expect(names.some((name) => name.includes(canonical))).toBe(true);
    },
  );
});
