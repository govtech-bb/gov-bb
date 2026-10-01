import type { OrgSection } from '../../../components/org/OrgBand'
import type { OrgContactDetails } from '../../../components/org/OrgContact'
import type { OrgHeroProps } from '../../../components/org/OrgHero'
import { ORG as customs } from './-data/customs'
import { ORG as drugService } from './-data/drug-service'
import { ORG as youth } from './-data/ministry-of-youth-sports-and-community-empowerment'

export type OrgKind = 'ministry' | 'department' | 'state-body'

/** House colours, read by the org components as CSS custom properties. */
export type OrgTheme = Partial<
  Record<
    `--org-${'wall-00' | 'wall-10' | 'wall-40' | 'wall-100' | 'link' | 'shutter-100'}`,
    string
  >
>

export interface Org {
  slug: string
  kind: OrgKind
  theme: OrgTheme
  hero: OrgHeroProps
  /** Bands in page order, below the hero. */
  sections: Array<OrgSection>
  contact: OrgContactDetails
}

// Only organisations rebuilt in the new design. The scraped set PR #502
// removed stays out until each is redone.
export const ORGS: Array<Org> = [youth, customs, drugService].sort((a, b) =>
  a.hero.name.localeCompare(b.hero.name),
)

export const ORG_BY_SLUG = new Map(ORGS.map((org) => [org.slug, org]))

export const orgHref = (slug: string) => `/government/organisations/${slug}`
