/**
 * The seeded data collections (#3183): `contacts`, the organisations a
 * citizen is told to get in touch with. From the block editor spike's
 * `MINISTRIES` (PR #2789, `packages/spike-db/src/seed-data/collections.ts`),
 * renamed. Records cover the Drug Service, the NIS Severance Payment
 * Department and StormReady's four storm contacts.
 *
 * The field names are conventional (`phone`, `email`, `website`) so a
 * renderer can link them by name.
 *
 * `public-holidays` (#3205) holds the one-off public holidays landing adds to
 * its bank holiday calendar.
 */

import type { CollectionSchema, RecordData } from "../modules/collection";
import { STORMREADY_CONTACTS } from "./stormready-contacts";

/** A collection as the seed writes it. */
export interface SeedCollection {
  key: string;
  title: string;
  record_key: string;
  schema: CollectionSchema;
  records: RecordData[];
}

export const CONTACTS: SeedCollection = {
  key: "contacts",
  title: "Ministries and departments",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "phone", label: "Telephone", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "website", label: "Website", type: "text" },
      { key: "address", label: "Address", type: "text" },
      { key: "hours", label: "Opening hours", type: "text" },
    ],
  },
  records: [
    {
      key: "barbados-drug-service",
      name: "Barbados Drug Service",
      phone: "(246) 535-4300",
      email: "management@drugservice.gov.bb",
      website: "drugservice.gov.bb",
      address: "6th Floor, Warrens Tower II",
    },
    {
      key: "nis-severance-payment-department",
      name: "NIS Severance Payment Department",
      phone: "+1 246-431-7400",
      address: "Frank Walcott Building, Culloden Road, St. Michael",
      hours: "Extensions 1502 to 1509",
    },
    ...STORMREADY_CONTACTS,
  ],
};

/**
 * Public holidays the Government declares on top of the statutory ones
 * (#3205). Landing calculates the statutory holidays and their substitution
 * days itself and adds these to the calendar for their year. `date` is text
 * holding an ISO `YYYY-MM-DD` date; landing ignores a record whose date isn't
 * one. No records. The seed runs only locally: deployed environments get the
 * collection through #3681 (created in the editor) or #3783 (imported).
 */
export const PUBLIC_HOLIDAYS: SeedCollection = {
  key: "public-holidays",
  title: "Public holidays",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "date", label: "Date (YYYY-MM-DD)", type: "text" },
      { key: "note", label: "Note", type: "text" },
    ],
  },
  records: [],
};

export const COLLECTIONS: readonly SeedCollection[] = [
  CONTACTS,
  PUBLIC_HOLIDAYS,
];
