/**
 * The seeded data collections (#3183): `contacts`, the organisations a
 * citizen is told to get in touch with. From the block editor spike's
 * `MINISTRIES` (PR #2789, `packages/spike-db/src/seed-data/collections.ts`),
 * renamed. Its records are the two the estate wrote out by hand: the Drug
 * Service from find-an-open-pharmacy, the NIS department from
 * calculate-severance-pay.
 *
 * The field names are conventional (`phone`, `email`, `website`) so a
 * renderer can link them by name.
 */

import type { CollectionSchema, RecordData } from "../modules/collection";

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
  ],
};

export const COLLECTIONS: readonly SeedCollection[] = [CONTACTS];
