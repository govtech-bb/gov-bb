/**
 * The three seeded page documents, plus one stub.
 *
 * The stub exists because the brief's own seed data fails its own rule 8:
 * the severance start page carries `target_kind: "page"` pointing at
 * `/money-financial-support/calculate-severance-pay/form`, which is not one
 * of the three seeded pages. Rule 8 requires an internal start_link to
 * resolve, so with three rows the seed cannot save. Seeding the calculator
 * page as a stub fixes it and gives the Start button somewhere to go.
 * Recorded in the findings.
 */

import type { Block, SchemaName } from "@govtech-bb/block-kit";

export interface SeedDocument {
  url: string;
  slug: string;
  schema_name: SchemaName;
  document_type: string;
  title: string;
  description: string | null;
  is_draft: boolean;
  body: { version: 1; blocks: Block[]; refs: Record<string, never> };
}

/* ----------------------------------------------- the prose case */

const severanceStart: SeedDocument = {
  url: "/money-financial-support/calculate-severance-pay/start",
  slug: "start",
  schema_name: "transaction",
  document_type: "service_start",
  title: "Find out how much severance payment you are owed",
  description: null,
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_sv01",
        type: "paragraph",
        content: [
          {
            text: "You should complete the calculator in one go. At the moment, it is not possible to save your answers and come back to them later.",
          },
        ],
      },
      {
        id: "b_sv02",
        type: "paragraph",
        content: [
          { text: "This tool only gives an " },
          { text: "estimate", marks: ["strong"] },
          {
            text: " based on the Severance Payments Act (Cap. 355A). Your contract of employment may entitle you to more. It is not legal advice.",
          },
        ],
      },
      {
        id: "b_sv03",
        type: "heading",
        level: 2,
        anchor: "how-long-does-it-take",
        content: [{ text: "How long does it take?" }],
      },
      {
        id: "b_sv04",
        type: "paragraph",
        content: [{ text: "About 3 minutes." }],
      },
      {
        id: "b_sv05",
        type: "heading",
        level: 2,
        anchor: "what-you-will-need",
        content: [{ text: "What you will need" }],
      },
      {
        id: "b_sv06",
        type: "paragraph",
        content: [{ text: "Have these ready before you start:" }],
      },
      {
        id: "b_sv07",
        type: "list",
        ordered: false,
        items: [
          {
            id: "b_sv07a",
            content: [
              {
                text: "why you were sent home (redundancy, disaster, lay-off or short time, or death of employer)",
              },
            ],
          },
          {
            id: "b_sv07b",
            content: [{ text: "your start date and your last day at work" }],
          },
          {
            id: "b_sv07c",
            content: [
              {
                // The em dash here is a round-trip canary.
                text: "your usual gross pay (weekly or monthly) — include overtime or bonuses",
              },
            ],
          },
        ],
      },
      {
        id: "b_sv08",
        type: "start_link",
        label: "Start your estimate now",
        target_kind: "page",
        target: "/money-financial-support/calculate-severance-pay/form",
      },
    ],
    refs: {},
  },
};

/** The stub the start_link needs in order to satisfy rule 8. */
const severanceForm: SeedDocument = {
  url: "/money-financial-support/calculate-severance-pay/form",
  slug: "form",
  schema_name: "transaction",
  document_type: "service_form",
  title: "Estimate your severance payment",
  description: null,
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_sf01",
        type: "notice",
        variant: "info",
        content: [
          {
            text: "The calculator itself is out of scope for this spike. This page exists so the start link on the previous page resolves.",
          },
        ],
      },
    ],
    refs: {},
  },
};

/* ------------------------------------------------ the data case */

const bankHolidays: SeedDocument = {
  url: "/bank-holiday-calendar",
  slug: "bank-holiday-calendar",
  schema_name: "calendar",
  document_type: "bank_holidays",
  title: "Check bank holiday dates",
  description: null,
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_bh01",
        type: "paragraph",
        content: [
          {
            text: "Bank holidays in Barbados for the current year. Where a holiday falls on a weekend, the following working day is taken in lieu.",
          },
        ],
      },
      {
        id: "b_bh02",
        type: "calendar",
        collection: "bank-holiday-rules",
        year_range: { min: 2020, max: 2050 },
        // 'cap-352', not the brief's 'next-working-day': the Act has three
        // distinct substitution rules and the naive policy produces days
        // that are not public holidays. See the findings.
        substitution_rule: "cap-352",
        show_past: true,
        columns: [
          { field: "date", label: "Date", format: "long_date" },
          { field: "name", label: "Holiday" },
          { field: "note", label: "Notes" },
        ],
      },
    ],
    refs: {},
  },
};

/* ------------------------------- the pure configuration case */

const pharmacyFinder: SeedDocument = {
  url: "/health-and-emergency-services/find-an-open-pharmacy/find",
  slug: "find",
  schema_name: "finder",
  document_type: "pharmacy_finder",
  title: "Search for pharmacies",
  description:
    "See which pharmacies are open now anywhere in Barbados, find free or subsidised medication through the Barbados Drug Service, and filter by parish.",
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_ph01",
        type: "finder",
        collection: "pharmacies",
        document_noun: "pharmacy",
        results_per_page: 20,
        empty_message:
          "No pharmacies match your filters. Try clearing the parish filter or turning off 'open now'.",
        search: {
          enabled: true,
          label: "Search by name, address or parish",
          fields: ["name", "address", "parish"],
        },
        facets: [
          {
            key: "openNow",
            name: "Open now",
            type: "checkbox",
            computed_from: "hours",
            allowed_values: [{ value: "yes", label: "Open now" }],
          },
          {
            // A radio, not the brief's checkbox: the values are mutually
            // exclusive in the production finder. `private-sbs` is not a
            // stored value of `type` — it is a predicate over `type` AND
            // `pppStatus`, hence computed_from naming both.
            key: "type",
            name: "Pharmacy type",
            type: "radio",
            computed_from: ["type", "pppStatus"],
            allowed_values: [
              { value: "all", label: "All", default: true },
              { value: "government", label: "Government polyclinic" },
              { value: "private-sbs", label: "Private, Drug Service" },
            ],
          },
          {
            key: "subsidisedOnly",
            name: "Free or subsidised only",
            type: "checkbox",
            computed_from: ["type", "pppStatus"],
            // Defaulted ON, matching DEFAULT_FILTERS in apps/landing.
            allowed_values: [
              { value: "yes", label: "Free or subsidised only", default: true },
            ],
          },
          {
            key: "slip",
            name: "Prescription colour",
            type: "radio",
            computed_from: ["type", "pppStatus"],
            allowed_values: [
              { value: "any", label: "Any", default: true },
              { value: "white", label: "White (Drug Service)" },
              { value: "yellow", label: "Yellow (GEHP)" },
              { value: "green", label: "Green (GEHP dependant)" },
            ],
          },
          {
            key: "parish",
            name: "Parish",
            type: "checkbox",
            combine_mode: "or",
            large: true,
            allowed_values_from: "parishes",
          },
        ],
        sort: [
          {
            key: "distance",
            name: "Nearest first",
            default: true,
            requires: "geolocation",
          },
          { key: "name", name: "A to Z" },
        ],
        result_template: {
          title: "name",
          metadata: ["parish", "type", "openNow"],
          detail_url:
            "/health-and-emergency-services/find-an-open-pharmacy/{slug}",
        },
      },
    ],
    refs: {},
  },
};

export const DOCUMENTS: SeedDocument[] = [
  pharmacyFinder,
  bankHolidays,
  severanceStart,
  severanceForm,
];
