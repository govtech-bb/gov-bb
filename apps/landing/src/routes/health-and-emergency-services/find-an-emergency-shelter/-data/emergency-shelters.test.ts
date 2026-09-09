import { describe, expect, it } from 'vitest'
import shelterData from './emergency-shelters.json'
import {
  EMERGENCY_SHELTERS,
  PARISHES,
  SHELTER_CONTENT,
  SHELTER_COUNT,
  SHELTERS_LAST_UPDATED,
  SHELTERS_NEXT_REVIEW,
  STORM_SEASON_LABEL,
} from './emergency-shelters.ts'
import {
  DISTRICT_CHAIRS,
  HURRICANE_TERMS,
  PHONE_DIRECTORY,
} from './guidance-data'

function expectUniqueIds(records: ReadonlyArray<{ id: string }>) {
  expect(new Set(records.map((record) => record.id)).size).toBe(records.length)
  for (const record of records)
    expect(record.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
}

describe('authored shelter content', () => {
  it('exposes every canonical field and all records without filtering or rewriting them', () => {
    expect(shelterData.schemaVersion).toBe(1)
    expect(SHELTER_CONTENT).toEqual(shelterData)
    expect(EMERGENCY_SHELTERS).toBe(SHELTER_CONTENT.shelters)
    expect(DISTRICT_CHAIRS).toBe(SHELTER_CONTENT.districtChairs)
    expect(HURRICANE_TERMS).toBe(SHELTER_CONTENT.hurricaneTerms)
    expect(PHONE_DIRECTORY).toBe(SHELTER_CONTENT.phoneDirectory)
    expect(SHELTER_COUNT).toBe(shelterData.shelters.length)
    expect(SHELTERS_LAST_UPDATED).toBe(shelterData.lastUpdated)
    expect(SHELTERS_NEXT_REVIEW).toBe(shelterData.nextReview)
    expect(STORM_SEASON_LABEL).toBe(shelterData.season)
  })

  it('has stable unique identities for shelters and each repeatable contact collection', () => {
    expectUniqueIds(SHELTER_CONTENT.shelters)
    expectUniqueIds(SHELTER_CONTENT.districtChairs)
    expectUniqueIds(SHELTER_CONTENT.hurricaneTerms)
    expectUniqueIds(SHELTER_CONTENT.phoneDirectory)
    for (const group of SHELTER_CONTENT.phoneDirectory) {
      expectUniqueIds(group.entries)
      for (const entry of group.entries) expectUniqueIds(entry.contacts)
    }
  })

  it('retains usable review information, contacts and reference definitions', () => {
    expect(SHELTER_CONTENT.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(SHELTER_CONTENT.nextReview > SHELTER_CONTENT.lastUpdated).toBe(true)
    expect(SHELTER_CONTENT.season.trim()).not.toBe('')
    for (const chair of DISTRICT_CHAIRS) {
      expect(chair.district.trim()).not.toBe('')
      expect(chair.name.trim()).not.toBe('')
      expect(chair.number.replace(/\D/g, '')).not.toBe('')
      expect(chair.tel).toMatch(/^tel:\+?\d+$/)
    }
    for (const term of HURRICANE_TERMS) {
      expect(term.term.trim()).not.toBe('')
      expect(term.definition.trim()).not.toBe('')
    }
    for (const entry of PHONE_DIRECTORY.flatMap((group) => group.entries)) {
      expect(entry.label.trim()).not.toBe('')
      for (const phone of entry.contacts) {
        expect(phone.display.trim()).not.toBe('')
        expect(phone.tel).toMatch(/^tel:\+?\d+$/)
      }
    }
  })

  it.each(SHELTER_CONTENT.shelters)(
    '$name has well-formed maintained fields',
    (shelter) => {
      expect(shelter.name.trim()).not.toBe('')
      expect(PARISHES).toContain(shelter.parish)
      expect([1, 2]).toContain(shelter.category)
      expect(['Public', 'Privately Owned']).toContain(shelter.ownership)
      expect(Number.isInteger(shelter.capacity)).toBe(true)
      expect(shelter.capacity).toBeGreaterThanOrEqual(0)
      expect(typeof shelter.water).toBe('boolean')
      expect(typeof shelter.access).toBe('boolean')
      if (shelter.coords) {
        expect(shelter.coords.lat).toBeGreaterThan(12.9)
        expect(shelter.coords.lat).toBeLessThan(13.4)
        expect(shelter.coords.lon).toBeGreaterThan(-59.7)
        expect(shelter.coords.lon).toBeLessThan(-59.4)
      }
    },
  )
})
