import { SHELTER_CONTENT } from './emergency-shelters'

export interface DistrictChair {
  id: string
  district: string
  name: string
  number: string
  tel: string
}

export interface HurricaneTerm {
  id: string
  term: string
  definition: string
}

export interface PhoneContact {
  id: string
  display: string
  tel: string
  note?: string
}

export interface PhoneEntry {
  id: string
  label: string
  /** Show this entry's first contact in the landing page's emergency cards. */
  landingLabel?: string
  contacts: ReadonlyArray<PhoneContact>
}

export interface PhoneGroup {
  id: string
  heading: string
  entries: ReadonlyArray<PhoneEntry>
}

export const DISTRICT_CHAIRS = SHELTER_CONTENT.districtChairs
export const HURRICANE_TERMS = SHELTER_CONTENT.hurricaneTerms
export const PHONE_DIRECTORY = SHELTER_CONTENT.phoneDirectory
