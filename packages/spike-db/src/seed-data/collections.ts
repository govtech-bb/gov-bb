/**
 * The four seeded collections.
 *
 * Each needs a `schema` listing its fields or validation rules 6 and 7
 * cannot resolve field names — that is the whole reason this is data and
 * not just a bag of records.
 */

import {
  BANK_HOLIDAY_RULES,
  type CollectionDefinition,
} from "@govtech-bb/block-kit";
import pharmacies from "./pharmacies.json";

export const PHARMACIES: CollectionDefinition = {
  key: "pharmacies",
  title: "Pharmacies",
  record_key: "slug",
  schema: {
    fields: [
      { key: "slug", label: "Slug", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "type", label: "Type", type: "select" },
      { key: "pppStatus", label: "Drug Service status", type: "select" },
      { key: "parish", label: "Parish", type: "select" },
      { key: "address", label: "Address", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "hours", label: "Opening hours", type: "weekly_hours" },
      { key: "routes", label: "Bus routes", type: "text" },
      { key: "coords", label: "Coordinates", type: "latlon" },
    ],
  },
};

export const PARISHES: CollectionDefinition = {
  key: "parishes",
  title: "Parishes",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
    ],
  },
};

export const BANK_HOLIDAY_RULE_COLLECTION: CollectionDefinition = {
  key: "bank-holiday-rules",
  title: "Bank holiday rules",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "note", label: "Note", type: "text" },
      { key: "rule", label: "Rule", type: "holiday_rule" },
      { key: "substitution", label: "Substitution", type: "select" },
    ],
  },
};

/**
 * The Environmental Health offices a hairdressing licence applicant deals
 * with. Seeded as a collection because the hair salon page ends in a list of
 * the same seven offices that several other Environmental Health pages also
 * end in — the canonical argument for a collection over a hand-typed list.
 */
export const EH_OFFICES: CollectionDefinition = {
  key: "environmental-health-offices",
  title: "Environmental Health offices",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Office", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "email" },
    ],
  },
};

export const COLLECTIONS: CollectionDefinition[] = [
  PHARMACIES,
  PARISHES,
  BANK_HOLIDAY_RULE_COLLECTION,
  EH_OFFICES,
];

/**
 * Twelve, not eleven: "All parishes" is the island-wide delivery service,
 * which the finder's parish predicate treats as matching every selection.
 */
export const PARISH_NAMES = [
  "Christ Church",
  "St. Andrew",
  "St. George",
  "St. James",
  "St. John",
  "St. Joseph",
  "St. Lucy",
  "St. Michael",
  "St. Peter",
  "St. Philip",
  "St. Thomas",
  "All parishes",
];

export interface SeedRecord {
  record_key: string;
  data: Record<string, unknown>;
}

export const PHARMACY_RECORDS: SeedRecord[] = (
  pharmacies as Array<Record<string, unknown>>
).map((row) => ({ record_key: String(row.slug), data: row }));

export const PARISH_RECORDS: SeedRecord[] = PARISH_NAMES.map((name) => ({
  record_key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  data: { key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name },
}));

export const HOLIDAY_RULE_RECORDS: SeedRecord[] = BANK_HOLIDAY_RULES.map(
  (rule) => ({
    record_key: rule.key,
    data: rule as unknown as Record<string, unknown>,
  }),
);

/** Verbatim from apps/landing/src/content/apply-for-hair-salon-licence.md. */
export const EH_OFFICE_RECORDS: SeedRecord[] = [
  {
    name: "Branford Taitt Polyclinic",
    phone: "(246) 536-3700",
    email: "EHD.BTPC@health.gov.bb",
  },
  {
    name: "David Thompson Health & Social Services Complex",
    phone: "(246) 536-4453",
    email: "DTHSSC.EHD@health.gov.bb",
  },
  {
    name: "Eunice Gibson Polyclinic",
    phone: "(246) 536-4033",
    email: "EuniceGibsonEHD@health.gov.bb",
  },
  {
    name: "Maurice Byer Polyclinic",
    phone: "(246) 536-3214",
    email: "MBPC.apps@health.gov.bb",
  },
  {
    name: "Randal Phillips Polyclinic",
    phone: "(246) 536-4338",
    email: "RPPC.EHD@health.gov.bb",
  },
  {
    name: "Sir Winston Scott Polyclinic",
    phone: "(246) 536-3476",
    email: "EHD.WSPC@health.gov.bb",
  },
  {
    name: "St. Philip Polyclinic",
    phone: "(246) 536-1240",
    email: "StPhilipEHD@health.gov.bb",
  },
].map((office) => {
  const key = office.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { record_key: key, data: { key, ...office } };
});

export const RECORDS_BY_COLLECTION: Record<string, SeedRecord[]> = {
  pharmacies: PHARMACY_RECORDS,
  parishes: PARISH_RECORDS,
  "environmental-health-offices": EH_OFFICE_RECORDS,
  "bank-holiday-rules": HOLIDAY_RULE_RECORDS,
};
