/**
 * Shared format definitions for the Barbados national-identifier fields —
 * `pattern`, input `mask`, and error `message` in one place so the components
 * can't drift apart (#2073). The identifier-field analogue of
 * `person-name-pattern.ts`.
 *
 * `pattern` is a string because component definitions are serialisable data
 * (the validation runner compiles it). `mask` is the Maskito template (`9` = a
 * digit); identifiers with no fixed-width shape omit it. Error messages follow
 * one phrasing: `Enter a valid <field> (for example, <sample>)`.
 */
export interface IdFormat {
  pattern: string;
  mask?: string;
  error: string;
}

export const NATIONAL_ID_FORMAT: IdFormat = {
  pattern: "^\\d{6}-\\d{4}$",
  mask: "999999-9999",
  error: "Enter a valid National ID number (for example, 850101-0001)",
};

export const NATIONAL_INSURANCE_FORMAT: IdFormat = {
  pattern: "^\\d{6}$",
  mask: "999999",
  error: "Enter a valid National Insurance number (for example, 123456)",
};

export const POSTCODE_FORMAT: IdFormat = {
  pattern: "^BB\\d{5}$",
  error: "Enter a valid postcode (for example, BB17004)",
};

// `^\d+$` (one-or-more), not the old `^\d*$` (zero-or-more) which matched the
// empty string on its own — the length gate is a separate rule (#2073).
export const TAMIS_FORMAT: IdFormat = {
  pattern: "^\\d+$",
  error: "Enter a valid TAMIS number (digits only)",
};
