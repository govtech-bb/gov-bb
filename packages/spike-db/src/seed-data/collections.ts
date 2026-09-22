/**
 * The three seeded collections.
 *
 * Each needs a `schema` listing its fields or validation rules 6 and 7
 * cannot resolve field names — that is the whole reason this is data and
 * not just a bag of records.
 */

import { BANK_HOLIDAY_RULES, type CollectionDefinition } from '@govtech-bb/block-kit'
import pharmacies from './pharmacies.json'

export const PHARMACIES: CollectionDefinition = {
  key: 'pharmacies',
  title: 'Pharmacies',
  record_key: 'slug',
  schema: {
    fields: [
      { key: 'slug', label: 'Slug', type: 'slug' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'type', label: 'Type', type: 'select' },
      { key: 'pppStatus', label: 'Drug Service status', type: 'select' },
      { key: 'parish', label: 'Parish', type: 'select' },
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'hours', label: 'Opening hours', type: 'weekly_hours' },
      { key: 'routes', label: 'Bus routes', type: 'text' },
      { key: 'coords', label: 'Coordinates', type: 'latlon' },
    ],
  },
}

export const PARISHES: CollectionDefinition = {
  key: 'parishes',
  title: 'Parishes',
  record_key: 'key',
  schema: {
    fields: [
      { key: 'key', label: 'Key', type: 'slug' },
      { key: 'name', label: 'Name', type: 'text' },
    ],
  },
}

export const BANK_HOLIDAY_RULE_COLLECTION: CollectionDefinition = {
  key: 'bank-holiday-rules',
  title: 'Bank holiday rules',
  record_key: 'key',
  schema: {
    fields: [
      { key: 'key', label: 'Key', type: 'slug' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'note', label: 'Note', type: 'text' },
      { key: 'rule', label: 'Rule', type: 'holiday_rule' },
      { key: 'substitution', label: 'Substitution', type: 'select' },
    ],
  },
}

export const COLLECTIONS: CollectionDefinition[] = [
  PHARMACIES,
  PARISHES,
  BANK_HOLIDAY_RULE_COLLECTION,
]

/**
 * Twelve, not eleven: "All parishes" is the island-wide delivery service,
 * which the finder's parish predicate treats as matching every selection.
 */
export const PARISH_NAMES = [
  'Christ Church',
  'St. Andrew',
  'St. George',
  'St. James',
  'St. John',
  'St. Joseph',
  'St. Lucy',
  'St. Michael',
  'St. Peter',
  'St. Philip',
  'St. Thomas',
  'All parishes',
]

export interface SeedRecord {
  record_key: string
  data: Record<string, unknown>
}

export const PHARMACY_RECORDS: SeedRecord[] = (
  pharmacies as Array<Record<string, unknown>>
).map((row) => ({ record_key: String(row.slug), data: row }))

export const PARISH_RECORDS: SeedRecord[] = PARISH_NAMES.map((name) => ({
  record_key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  data: { key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name },
}))

export const HOLIDAY_RULE_RECORDS: SeedRecord[] = BANK_HOLIDAY_RULES.map(
  (rule) => ({ record_key: rule.key, data: rule as unknown as Record<string, unknown> }),
)

export const RECORDS_BY_COLLECTION: Record<string, SeedRecord[]> = {
  pharmacies: PHARMACY_RECORDS,
  parishes: PARISH_RECORDS,
  'bank-holiday-rules': HOLIDAY_RULE_RECORDS,
}
