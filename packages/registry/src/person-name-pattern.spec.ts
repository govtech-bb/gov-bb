import { PERSON_NAME_PATTERN } from "./person-name-pattern";

// Compile the same way the validation runner does (patternRunner uses the `u`
// flag). This proves the shared pattern's accept/reject behaviour (#1843).
const re = new RegExp(PERSON_NAME_PATTERN, "u");

describe("PERSON_NAME_PATTERN", () => {
  it.each([
    // Latin-1 (already worked) — must still pass
    "José",
    "Müller",
    "Anne Marie",
    "Smith-Jones",
    "O'Brien", // straight apostrophe
    // The names #1843 reported as wrongly rejected
    "St. John", // period
    "J. R.", // initials with trailing period (lead's request)
    "O’Brien", // typographic apostrophe U+2019
    "d’Arc",
    "Łukasz", // Polish
    "Wałęsa",
    "Dvořák", // Czech
    "Nguyễn", // Vietnamese (combining marks)
    "Şükrü", // Turkish
    "Ștefan", // Romanian
    "Владимир", // Cyrillic
    "李", // CJK (single char — passes the pattern; still gated by minLength)
    "أحمد", // Arabic
    // NFD (decomposed) names ending in an accented letter: the final char is a
    // combining mark, not a base letter — must still be accepted (iOS/macOS
    // often produce NFD). See #1843 review finding.
    "Lê".normalize("NFD"), // L, e, combining circumflex
    "José".normalize("NFD"), // ends in e + combining acute
  ])("accepts %s", (name) => {
    expect(re.test(name)).toBe(true);
  });

  it.each([
    ["", "empty string"],
    ["   ", "whitespace only"],
    ["123", "digits"],
    ["a@b", "symbol"],
    ["Smith-", "dangling hyphen"],
    ["-Smith", "leading hyphen"],
    ["’Brien", "leading apostrophe"],
  ])("rejects %s (%s)", (name) => {
    expect(re.test(name)).toBe(false);
  });
});
