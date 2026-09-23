/**
 * The five seeded page documents, plus two stubs.
 *
 * The stub exists because the brief's own seed data fails its own rule 8:
 * the severance start page carries `target_kind: "page"` pointing at
 * `/money-financial-support/calculate-severance-pay/form`, which is not one
 * of the three seeded pages. Rule 8 requires an internal start_link to
 * resolve, so with three rows the seed cannot save. Seeding the calculator
 * page as a stub fixes it and gives the Start button somewhere to go.
 * Recorded in the findings.
 */

import type { Block, Ref, SchemaName } from "@govtech-bb/block-kit/document";

export interface SeedDocument {
  url: string;
  slug: string;
  schema_name: SchemaName;
  document_type: string;
  title: string;
  description: string | null;
  is_draft: boolean;
  body: { version: 1; blocks: Block[]; refs: Record<string, Ref> };
}

/* ------------------------------ the entry page in front of a transaction */

/**
 * Taken from the live estate's index.md. The start page already seeded here
 * is its start.md, and the two are genuinely different documents: this one
 * says whether the tool applies to you at all, and the start page says what
 * to have ready before you begin.
 *
 * Three things about it do not fit the spike's model, all recorded in the
 * findings:
 *
 * - it carries TWO categories (money-financial-support and work-employment)
 *   and the url can hold one, so the second is simply lost;
 * - its title is identical to the start page's, because that is what the
 *   live estate has — which is why the test helper selects documents by url
 *   rather than by title;
 * - the NIS address needs hard line breaks, and the block palette has no way
 *   to say "new line but not new paragraph", so it renders as four
 *   paragraphs with paragraph spacing between them.
 */
const severanceEntry: SeedDocument = {
  url: "/money-financial-support/calculate-severance-pay",
  slug: "calculate-severance-pay",
  schema_name: "guide",
  document_type: "service_start",
  title: "Find out how much severance payment you are owed",
  description:
    "Estimate the severance payment you may be owed under the Severance Payments Act (Cap. 355A) if you were made redundant, your workplace was damaged by a disaster, you were laid off, or your employer died.",
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_se01",
        type: "paragraph",
        content: [
          {
            text: "If you were sent home from your job, your employer may owe you severance payment. This tool gives you an estimate based on the ",
          },
          { text: "Severance Payments Act (Cap. 355A)", ref: "r_act" },
          { text: " — it is not legal advice." },
        ],
      },
      {
        id: "b_se02",
        type: "paragraph",
        content: [{ text: "You can use this tool if:" }],
      },
      {
        id: "b_se03",
        type: "list",
        ordered: false,
        items: [
          {
            id: "i_se03a",
            content: [
              { text: "you worked for the same employer for at least " },
              { text: "2 years", marks: ["strong"] },
            ],
          },
          {
            id: "i_se03b",
            content: [
              {
                text: "you were between 16 and 67 years old on your last day at work",
              },
            ],
          },
          {
            id: "i_se03c",
            content: [
              {
                text: "you were sent home because your job was cut, your workplace was damaged by a disaster, you had no work for a long time, or your employer died",
              },
            ],
          },
        ],
      },
      {
        id: "b_se04",
        type: "heading",
        level: 2,
        anchor: "how-to-get-your-estimate",
        content: [{ text: "How to get your estimate" }],
      },
      {
        id: "b_se05",
        type: "heading",
        level: 3,
        anchor: "use-the-online-calculator",
        content: [{ text: "Use the online calculator" }],
      },
      {
        id: "b_se06",
        type: "paragraph",
        content: [
          {
            text: "You will answer a short set of questions about why you were sent home, when you worked for the employer, and your usual gross pay. We then estimate how much you may be owed.",
          },
        ],
      },
      {
        id: "b_se07",
        type: "start_link",
        label: "Start your estimate now",
        target_kind: "page",
        target: "/money-financial-support/calculate-severance-pay/start",
      },
      {
        id: "b_se08",
        type: "heading",
        level: 2,
        anchor: "do-not-wait-too-long",
        content: [{ text: "Do not wait too long" }],
      },
      {
        id: "b_se09",
        type: "paragraph",
        content: [
          { text: "You must make your claim within " },
          { text: "12 months", marks: ["strong"] },
          {
            text: " of your last day at work. If you wait longer, you may lose your right to severance payment.",
          },
        ],
      },
      {
        id: "b_se10",
        type: "heading",
        level: 2,
        anchor: "need-help-or-advice",
        content: [{ text: "Need help or advice?" }],
      },
      {
        id: "b_se11",
        type: "paragraph",
        content: [
          { text: "Contact the " },
          { text: "NIS Severance Payment Department", marks: ["strong"] },
          {
            text: ". They can give you free advice and help you claim if your employer does not pay.",
          },
        ],
      },
      {
        id: "b_se12",
        type: "paragraph",
        content: [{ text: "NIS Severance Payment Department" }],
      },
      {
        id: "b_se13",
        type: "paragraph",
        content: [{ text: "Frank Walcott Building" }],
      },
      {
        id: "b_se14",
        type: "paragraph",
        content: [{ text: "Culloden Road" }],
      },
      {
        id: "b_se15",
        type: "paragraph",
        content: [{ text: "St. Michael" }],
      },
      {
        id: "b_se16",
        type: "paragraph",
        content: [
          { text: "Phone: " },
          { text: "+1 246-431-7400", ref: "r_nis_phone" },
          { text: ", extensions 1502 to 1509" },
        ],
      },
    ],
    refs: {
      r_act: { kind: "external", href: "https://www.nis.gov.bb/severance/" },
      r_nis_phone: { kind: "external", href: "tel:+12464317400" },
    },
  },
};

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
  title: "Bank holidays",
  description: null,
  is_draft: false,
  body: {
    version: 1,
    blocks: [
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
          { field: "day", label: "Day" },
          { field: "name", label: "Holiday" },
          { field: "note", label: "Notes" },
        ],
      },
      {
        id: "b_bh03",
        type: "heading",
        level: 2,
        anchor: "about-this-list",
        content: [{ text: "About this list" }],
      },
      {
        id: "b_bh04",
        type: "paragraph",
        content: [
          {
            text: "Bank holidays in Barbados are set out in the Public Holidays Act, Cap. 352. The Government may also declare additional one-off public holidays from time to time.",
          },
        ],
      },
      {
        id: "b_bh05",
        type: "paragraph",
        content: [
          { text: "This page is updated when new dates are gazetted." },
        ],
      },
      {
        id: "b_bh06",
        type: "paragraph",
        content: [
          { text: "Source:", marks: ["strong"] },
          {
            text: " Public Holidays Act, Cap. 352 — Government of Barbados Ministry of Labour. ",
          },
          { text: "View official list at labour.gov.bb", ref: "r_labour" },
          { text: "." },
        ],
      },
    ],
    refs: {
      r_labour: {
        kind: "external",
        href: "https://labour.gov.bb/library/library-publications/holidays/",
      },
    },
  },
};

/* ------------------------------- the pure configuration case */

/* ------------------------------- the entry page in front of a finder */

/**
 * The page a citizen actually arrives on, taken from the live estate at
 * /health-and-emergency-services/find-an-open-pharmacy.
 *
 * It is here because the spike had the finder and nothing in front of it,
 * which is not how the service works: the finder answers "which pharmacy",
 * and everything a person needs to know before walking into one — what ID to
 * take, who may collect for them, what the prescription colours mean — lives
 * on this page. Splitting them also gives the `start_link` block a real job
 * on a real page rather than only on the severance start page.
 *
 * Two of its links point at pages the spike does not seed
 * (free-or-subsidised-medication, prescription-colours). They are `page`
 * refs, which rule 8 does not check — only a start_link's target is
 * required to resolve — so they save. That asymmetry is worth knowing: the
 * estate can accumulate broken inline links while start buttons stay sound.
 */
const pharmacyEntry: SeedDocument = {
  url: "/health-and-emergency-services/find-an-open-pharmacy",
  slug: "find-an-open-pharmacy",
  schema_name: "guide",
  document_type: "service_start",
  title:
    "Find a pharmacy and check what Barbados Drug Service benefits it offers",
  description:
    "Find a pharmacy that's open now anywhere in Barbados. You can also find pharmacies offering free or subsidised medication through the Barbados Drug Service, and check who qualifies.",
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_pe01",
        type: "paragraph",
        content: [
          {
            text: "If you are eligible, you can get prescription medication free at a government polyclinic pharmacy or pay a small dispensing fee at a private pharmacy that participates in the government subsidy programme. This service is provided through the Special Benefit Service (SBS). The Barbados Drug Service (BDS) pays the pharmacy on your behalf.",
          },
        ],
      },
      {
        id: "b_pe02",
        type: "start_link",
        label: "Find an open pharmacy",
        target_kind: "page",
        target: "/health-and-emergency-services/find-an-open-pharmacy/find",
      },
      {
        id: "b_pe03",
        type: "heading",
        level: 2,
        anchor: "what-to-take",
        content: [{ text: "What to take to the pharmacy" }],
      },
      {
        id: "b_pe04",
        type: "list",
        ordered: false,
        items: [
          {
            id: "i_pe04a",
            content: [{ text: "your prescription" }],
          },
          {
            id: "i_pe04b",
            content: [
              {
                text: "original accepted ID for the person the medication is for: a Barbados National Identification (ID) card, passport or child health book. A child health book is only accepted for children up to 6 weeks old. After 6 weeks, an ID card is required.",
              },
            ],
          },
        ],
      },
      {
        id: "b_pe05",
        type: "paragraph",
        content: [{ text: "Photocopies are not accepted." }],
      },
      {
        id: "b_pe06",
        type: "heading",
        level: 2,
        anchor: "collecting-for-someone-else",
        content: [{ text: "Collecting for someone else" }],
      },
      {
        id: "b_pe07",
        type: "paragraph",
        content: [
          {
            text: "Medication must be collected in person. This service is not available online. Someone else can collect for you. They will need to bring your prescription, your ID, and their own ID.",
          },
        ],
      },
      {
        id: "b_pe08",
        type: "heading",
        level: 2,
        anchor: "free-or-subsidised-medication",
        content: [{ text: "Get free or subsidised medication" }],
      },
      {
        id: "b_pe09",
        type: "paragraph",
        content: [
          {
            text: "Some pharmacies can lower or remove the cost of your prescription medication through the Barbados Drug Service if you qualify. Medication is free at government (polyclinic) pharmacies and costs less at private pharmacies that work with the Drug Service. Not all private pharmacies take part. At those pharmacies, you pay full price.",
          },
        ],
      },
      {
        id: "b_pe10",
        type: "paragraph",
        content: [
          {
            text: "Check who qualifies and what to bring",
            ref: "r_subsidised",
          },
        ],
      },
      {
        id: "b_pe11",
        type: "heading",
        level: 2,
        anchor: "prescription-colours",
        content: [{ text: "Prescription colours" }],
      },
      {
        id: "b_pe12",
        type: "paragraph",
        content: [
          {
            text: "Prescriptions in Barbados come in different colours. The colour of your prescription can affect which pharmacy can fill it.",
          },
        ],
      },
      {
        id: "b_pe13",
        type: "paragraph",
        content: [
          {
            text: "Check what the prescription colours mean",
            ref: "r_colours",
          },
        ],
      },
      {
        id: "b_pe14",
        type: "heading",
        level: 2,
        anchor: "get-help",
        content: [{ text: "Get help" }],
      },
      {
        id: "b_pe15",
        type: "paragraph",
        content: [
          {
            text: "If a pharmacy will not accept your Drug Service prescription, or you have a problem getting your medication, contact the Drug Service.",
          },
        ],
      },
      {
        id: "b_pe16",
        type: "paragraph",
        content: [
          { text: "Telephone: " },
          { text: "(246) 535-4300", ref: "r_phone" },
        ],
      },
      {
        id: "b_pe17",
        type: "paragraph",
        content: [
          { text: "Email: " },
          { text: "management@drugservice.gov.bb", ref: "r_email" },
        ],
      },
      {
        id: "b_pe18",
        type: "paragraph",
        content: [
          { text: "Website: " },
          { text: "drugservice.gov.bb", ref: "r_website" },
        ],
      },
      {
        id: "b_pe19",
        type: "paragraph",
        content: [{ text: "Address: 6th Floor, Warrens Tower II" }],
      },
    ],
    refs: {
      r_subsidised: {
        kind: "page",
        url: "/health-and-emergency-services/free-or-subsidised-medication",
      },
      r_colours: {
        kind: "page",
        url: "/health-and-emergency-services/prescription-colours",
      },
      r_phone: { kind: "external", href: "tel:+12465354300" },
      r_email: {
        kind: "external",
        href: "mailto:management@drugservice.gov.bb",
      },
      r_website: { kind: "external", href: "https://drugservice.gov.bb" },
    },
  },
};

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

/* ------------------------------------- the callout-and-checklist case */

/**
 * The Crop Over permits entry page.
 *
 * Ported from `apps/landing/src/content/crop-over-permits/index.md`, and it
 * earns its place for one reason: that markdown file contains a hand-written
 * `<div class="border-blue-40 border-l-4 bg-blue-10 p-s">` to draw a callout.
 * Presentation smuggled into content, with Tailwind class names baked into a
 * page an author is supposed to own — exactly the thing a closed block
 * palette exists to stop. Here it is a `notice` block with a variant, and the
 * renderer decides what a warning looks like.
 *
 * It is also the first seeded page whose notice carries marks, so the bold
 * run inside a non-paragraph block is exercised rather than assumed.
 */
const cropOverPermits: SeedDocument = {
  url: "/business-trade/crop-over-permits",
  slug: "crop-over-permits",
  schema_name: "transaction",
  document_type: "service_start",
  title: "Find the permits you need for a Crop Over event",
  description:
    "Find out which permits you need to run a Crop Over event, which agencies to contact, and in what order.",
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_co01",
        type: "paragraph",
        content: [
          {
            text: "Find out which permits you need, which agencies to contact, and in what order.",
          },
        ],
      },
      {
        id: "b_co02",
        type: "heading",
        level: 2,
        anchor: "how-long-does-it-take",
        content: [{ text: "How long does it take?" }],
      },
      {
        id: "b_co03",
        type: "paragraph",
        content: [
          {
            text: "About 5 minutes. Your checklist is based on the type of event you are organising.",
          },
        ],
      },
      {
        id: "b_co04",
        type: "heading",
        level: 2,
        anchor: "what-you-will-need",
        content: [{ text: "What you will need" }],
      },
      {
        id: "b_co05",
        type: "list",
        ordered: false,
        items: [
          {
            id: "b_co05a",
            content: [{ text: "The type of event you are putting on." }],
          },
          {
            id: "b_co05b",
            content: [
              {
                text: "Your venue — private, beach, public road, or on the water.",
              },
            ],
          },
          {
            id: "b_co05c",
            content: [{ text: "How many people you expect." }],
          },
          {
            id: "b_co05d",
            content: [
              {
                text: "Whether you plan to serve alcohol, play music, use a stage, or bring overseas performers.",
              },
            ],
          },
        ],
      },
      {
        id: "b_co06",
        type: "notice",
        variant: "info",
        content: [
          { text: "Indicative guidance only.", marks: ["strong"] },
          {
            text: " Always confirm requirements directly with each agency before applying.",
          },
        ],
      },
      {
        id: "b_co07",
        type: "start_link",
        label: "Start now",
        target_kind: "page",
        target: "/business-trade/crop-over-permits/form",
      },
    ],
    refs: {},
  },
};

/** The stub the Crop Over start link needs in order to satisfy rule 8. */
const cropOverPermitsForm: SeedDocument = {
  url: "/business-trade/crop-over-permits/form",
  slug: "form",
  schema_name: "transaction",
  document_type: "service_form",
  title: "Build your Crop Over permit checklist",
  description: null,
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_cf01",
        type: "notice",
        variant: "info",
        content: [
          {
            text: "The permit checklist itself is out of scope for this spike. This page exists so the start link on the previous page resolves.",
          },
        ],
      },
    ],
    refs: {},
  },
};

/* --------------------------------------- the reference-and-table case */

/**
 * The hairdressing and beautician business licence page.
 *
 * The first seeded page to use `body.refs` at all, and it uses both kinds:
 * an `external` ref behind an inline link to the Regulations, and a `query`
 * ref that the contact list reads through. Until this page, `refs` was `{}`
 * on every document and the `data_table` block existed without a single
 * consumer — the brief's own control case, never actually controlled.
 *
 * The seven Environmental Health offices were a hand-typed markdown list
 * repeated across Environmental Health pages. Here they are a collection,
 * and the page holds a query over it: change a polyclinic's phone number
 * once and every page that lists it is correct.
 *
 * The online application form is out of scope for the spike, so "How to
 * apply" keeps both routes as content but carries no start_link — which is
 * also why this page needs no stub to satisfy rule 8.
 */
const hairSalonLicence: SeedDocument = {
  url: "/business-trade/apply-for-hair-salon-licence",
  slug: "apply-for-hair-salon-licence",
  schema_name: "guide",
  document_type: "licence_guide",
  title: "Apply for a hairdressing and beautician business licence",
  description:
    "Register a new hair, beauty, manicure or pedicure business, or renew your existing registration with Environmental Health.",
  is_draft: false,
  body: {
    version: 1,
    blocks: [
      {
        id: "b_hs01",
        type: "paragraph",
        content: [
          {
            text: "Use this service to apply for or renew a hairdressing salon licence.",
          },
        ],
      },
      {
        id: "b_hs02",
        type: "heading",
        level: 2,
        anchor: "who-is-this-licence-for",
        content: [
          {
            text: "Who is this licence for",
          },
        ],
      },
      {
        id: "b_hs03",
        type: "paragraph",
        content: [
          {
            text: "You must apply for a hairdressing salon licence if your business provides any of these services to the public:",
          },
        ],
      },
      {
        id: "b_hs04",
        type: "list",
        ordered: false,
        items: [
          {
            id: "b_hs04a",
            content: [
              {
                text: "hairdressing or barbering",
              },
            ],
          },
          {
            id: "b_hs04b",
            content: [
              {
                text: "beauty services",
              },
            ],
          },
          {
            id: "b_hs04c",
            content: [
              {
                text: "manicures",
              },
            ],
          },
          {
            id: "b_hs04d",
            content: [
              {
                text: "pedicures",
              },
            ],
          },
          {
            id: "b_hs04e",
            content: [
              {
                text: "hair braiding",
              },
            ],
          },
        ],
      },
      {
        id: "b_hs05",
        type: "paragraph",
        content: [
          {
            text: "Anyone providing these services also needs their own personal hairdressers licence. The business licence does not give the owner or staff a licence.",
          },
        ],
      },
      {
        id: "b_hs06",
        type: "paragraph",
        content: [
          {
            text: "This applies whether you provide services:",
          },
        ],
      },
      {
        id: "b_hs07",
        type: "list",
        ordered: false,
        items: [
          {
            id: "b_hs07a",
            content: [
              {
                text: "at a business location",
              },
            ],
          },
          {
            id: "b_hs07b",
            content: [
              {
                text: "from home (for example, at-home hairdressers)",
              },
            ],
          },
          {
            id: "b_hs07c",
            content: [
              {
                text: "at clients' locations or from a vehicle",
              },
            ],
          },
        ],
      },
      {
        id: "b_hs08",
        type: "paragraph",
        content: [
          {
            text: "If your business is not licensed, Environmental Health will contact you and inform you that you need to apply. They may issue a notice if an application is not made.",
          },
        ],
      },
      {
        id: "b_hs09",
        type: "heading",
        level: 2,
        anchor: "before-you-start",
        content: [
          {
            text: "Before you start",
          },
        ],
      },
      {
        id: "b_hs10",
        type: "paragraph",
        content: [
          {
            text: "You will need:",
          },
        ],
      },
      {
        id: "b_hs11",
        type: "list",
        ordered: false,
        items: [
          {
            id: "b_hs11a",
            content: [
              {
                text: "your current hairdressing salon licence number (if renewing)",
              },
            ],
          },
          {
            id: "b_hs11b",
            content: [
              {
                text: "the name and address of the business",
              },
            ],
          },
          {
            id: "b_hs11c",
            content: [
              {
                text: "the name and address of the owner or operator",
              },
            ],
          },
          {
            id: "b_hs11d",
            content: [
              {
                text: "a document listing your hairdressing staff, giving each person's name and gender (staff list)",
              },
            ],
          },
          {
            id: "b_hs11e",
            content: [
              {
                text: "medical certificates of all hairdressing staff",
              },
            ],
          },
          {
            id: "b_hs11f",
            content: [
              {
                text: "a vehicle registration number if the business uses a vehicle",
              },
            ],
          },
        ],
      },
      {
        id: "b_hs12",
        type: "paragraph",
        content: [
          {
            text: "Uploading medical certificates is optional. You can show them during the inspection instead.",
          },
        ],
      },
      {
        id: "b_hs13",
        type: "paragraph",
        content: [
          {
            text: "Read the ",
          },
          {
            text: "Health Services (Hairdressers) Regulations, 1970",
            ref: "r_regulations",
          },
          {
            text: " for the full legal requirements.",
          },
        ],
      },
      {
        id: "b_hs14",
        type: "heading",
        level: 2,
        anchor: "when-to-apply",
        content: [
          {
            text: "When to apply",
          },
        ],
      },
      {
        id: "b_hs15",
        type: "paragraph",
        content: [
          {
            text: "Your licence expires on December 31st each year. You need to renew it by the first business day in January each year. It is suggested that you submit your application by December 1st.",
          },
        ],
      },
      {
        id: "b_hs16",
        type: "heading",
        level: 2,
        anchor: "how-to-apply",
        content: [
          {
            text: "How to apply",
          },
        ],
      },
      {
        id: "b_hs17",
        type: "list",
        ordered: true,
        items: [
          {
            id: "b_hs17a",
            content: [
              {
                text: "Apply for a licence online.",
                marks: ["strong"],
              },
              {
                text: " Allow about 15 minutes to complete the form.",
              },
            ],
          },
          {
            id: "b_hs17b",
            content: [
              {
                text: "Get a paper application from the polyclinic.",
                marks: ["strong"],
              },
              {
                text: " You must complete it by hand and submit it to the polyclinic for the district where the salon is located. Contact details are at the bottom of this page.",
              },
            ],
          },
        ],
      },
      {
        id: "b_hs18",
        type: "heading",
        level: 2,
        anchor: "cost",
        content: [
          {
            text: "Cost",
          },
        ],
      },
      {
        id: "b_hs19",
        type: "paragraph",
        content: [
          {
            text: "There is neither a cost to apply, nor to receive your licence.",
          },
        ],
      },
      {
        id: "b_hs20",
        type: "heading",
        level: 2,
        anchor: "what-happens-after-you-apply",
        content: [
          {
            text: "What happens after you apply",
          },
        ],
      },
      {
        id: "b_hs21",
        type: "paragraph",
        content: [
          {
            text: "Environmental Health will review your application and inspect the business.",
          },
        ],
      },
      {
        id: "b_hs22",
        type: "paragraph",
        content: [
          {
            text: "During the inspection, you will need to show:",
          },
        ],
      },
      {
        id: "b_hs23",
        type: "list",
        ordered: false,
        items: [
          {
            id: "b_hs23a",
            content: [
              {
                text: "your cleaning schedule of the premises and equipment",
              },
            ],
          },
          {
            id: "b_hs23b",
            content: [
              {
                text: "the cleaning and sanitation process of the equipment including towels",
              },
            ],
          },
          {
            id: "b_hs23c",
            content: [
              {
                text: "facilities with hot and cold water",
              },
            ],
          },
          {
            id: "b_hs23d",
            content: [
              {
                text: "any staff medical certificates you did not upload",
              },
            ],
          },
        ],
      },
      {
        id: "b_hs24",
        type: "paragraph",
        content: [
          {
            text: "If you provide services from a vehicle, Environmental Health will need to arrange an inspection of the vehicle.",
          },
        ],
      },
      {
        id: "b_hs25",
        type: "notice",
        variant: "info",
        content: [
          {
            text: "Obtaining your licence. ",
            marks: ["strong"],
          },
          {
            text: "If your application is approved you will receive a confirmation email, and the Environmental Health Office will post your licence. You can also ask to collect it from your assigned polyclinic. Once you receive it, it must be displayed in the establishment.",
          },
        ],
      },
      {
        id: "b_hs26",
        type: "heading",
        level: 2,
        anchor: "contact",
        content: [
          {
            text: "Contact",
          },
        ],
      },
      {
        id: "b_hs27",
        type: "paragraph",
        content: [
          {
            text: "If you need help, contact the relevant Environmental Health Service office.",
          },
        ],
      },
      {
        id: "b_hs28",
        type: "data_table",
        source: "r_eh_offices",
        columns: [
          {
            field: "name",
            label: "Office",
          },
          {
            field: "phone",
            label: "Phone",
          },
          {
            field: "email",
            label: "Email",
          },
        ],
        empty_message: "No offices are listed.",
      },
    ] as Block[],
    refs: {
      r_regulations: {
        kind: "external",
        href: "https://oag.gov.bb/attachments/Health%20Services%20(Hairdressers)%20Regulations,%201970%20Cap44'N.PDF",
      },
      r_eh_offices: {
        kind: "query",
        collection: "environmental-health-offices",
        order_by: {
          field: "name",
          direction: "asc",
        },
      },
    } as Record<string, Ref>,
  },
};

export const DOCUMENTS: SeedDocument[] = [
  pharmacyEntry,
  pharmacyFinder,
  severanceEntry,
  bankHolidays,
  severanceStart,
  severanceForm,
  cropOverPermits,
  cropOverPermitsForm,
  hairSalonLicence,
];
