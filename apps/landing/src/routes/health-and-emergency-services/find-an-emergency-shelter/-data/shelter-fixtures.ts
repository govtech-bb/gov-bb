import type { Shelter, ShelterContent } from './emergency-shelters'
import { SHELTER_CONTENT } from './emergency-shelters'

export const ALPHA_SHELTER: Shelter = {
  id: 'example-alpha',
  name: 'Example Alpha School',
  parish: 'St. Michael',
  category: 1,
  ownership: 'Public',
  capacity: 60,
  water: true,
  access: true,
  coords: { lat: 13.1, lon: -59.6 },
  address: 'Example Avenue',
  notes: 'Example source note.',
}

export const BETA_SHELTER: Shelter = {
  id: 'example-beta',
  name: 'Example Beta Hall',
  parish: 'St. Philip',
  category: 2,
  ownership: 'Privately Owned',
  capacity: 120,
  water: false,
  access: false,
  restriction: 'Example restriction',
}

export const GAMMA_SHELTER: Shelter = {
  ...ALPHA_SHELTER,
  id: 'example-gamma',
  name: 'Example Gamma School',
  capacity: 20,
  coords: { lat: 13.2, lon: -59.6 },
}

export const SHELTER_CONTENT_FIXTURE: ShelterContent = {
  ...SHELTER_CONTENT,
  lastUpdated: '2026-05-27',
  nextReview: '2027-05-01',
  season: '1 June to 30 November',
  shelters: [ALPHA_SHELTER, BETA_SHELTER, GAMMA_SHELTER],
  districtChairs: [
    {
      id: 'example-district',
      district: 'Example District',
      name: 'Example Chair',
      number: '555-0100',
      tel: 'tel:+12465550100',
    },
  ],
  hurricaneTerms: [
    {
      id: 'example-term',
      term: 'Example term',
      definition: 'Example definition.',
    },
  ],
  phoneDirectory: [
    {
      id: 'dem',
      heading: 'Example telephone directory',
      entries: [
        {
          id: 'dem-main-switchboard',
          label: 'Example switchboard',
          landingLabel: 'Example emergency help',
          contacts: [
            {
              id: 'example-switchboard-phone',
              display: '555-0101',
              tel: 'tel:+12465550101',
              note: 'Example telephone note',
            },
          ],
        },
      ],
    },
  ],
}
