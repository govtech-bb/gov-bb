import { OrgActionLinks } from './OrgActionLinks'
import { OrgBlockHead } from './OrgBlockHead'
import { OrgCards } from './OrgCards'
import { OrgContact } from './OrgContact'
import { OrgFacts } from './OrgFacts'
import { OrgNews } from './OrgNews'
import { OrgOffices } from './OrgOffices'
import { OrgServiceList } from './OrgServiceList'
import { OrgSteps } from './OrgSteps'
import { OrgTiles } from './OrgTiles'
import type { OrgLink } from './OrgBlockHead'
import type { OrgCard } from './OrgCards'
import type { OrgContactDetails } from './OrgContact'
import type { OrgFact } from './OrgFacts'
import type { OrgNewsItem } from './OrgNews'
import type { OrgOffice } from './OrgOffices'
import type { OrgStep } from './OrgSteps'
import type { OrgService } from './OrgTiles'

export type OrgSection = {
  title: string
  seeAll?: OrgLink
  tone?: 'grey'
  /** The contact panel in the right-hand third. Two-thirds blocks only. */
  withContact?: true
} & (
  | { type: 'cards'; items: Array<OrgCard> }
  | { type: 'tiles'; items: Array<OrgService> }
  | { type: 'service-list'; items: Array<OrgService> }
  | { type: 'news'; items: Array<OrgNewsItem> }
  | { type: 'steps'; items: Array<OrgStep>; warning?: string }
  | { type: 'facts'; items: Array<OrgFact> }
  | { type: 'actions'; items: Array<OrgLink> }
  | { type: 'offices'; items: Array<OrgOffice> }
)

/** One band of an organisation page: a block under its head, full width or two thirds. */
export function OrgBand({
  section,
  contact,
}: {
  section: OrgSection
  contact: OrgContactDetails
}) {
  const fullWidth = section.type === 'cards' || section.type === 'tiles'
  return (
    <div className={section.tone === 'grey' ? 'bg-grey-10' : undefined}>
      <div className="govbb-width-container grid gap-m py-m lg:grid-cols-3 lg:py-l">
        <section
          className={`space-y-m ${fullWidth ? 'lg:col-span-3' : 'lg:col-span-2'}`}
        >
          <OrgBlockHead title={section.title} seeAll={section.seeAll} />
          <Block section={section} />
        </section>
        {section.withContact ? <OrgContact contact={contact} /> : null}
      </div>
    </div>
  )
}

function Block({ section }: { section: OrgSection }) {
  switch (section.type) {
    case 'cards':
      return <OrgCards items={section.items} />
    case 'tiles':
      return <OrgTiles items={section.items} />
    case 'service-list':
      return <OrgServiceList items={section.items} />
    case 'news':
      return <OrgNews items={section.items} />
    case 'steps':
      return <OrgSteps items={section.items} warning={section.warning} />
    case 'facts':
      return <OrgFacts items={section.items} />
    case 'actions':
      return <OrgActionLinks items={section.items} />
    case 'offices':
      return <OrgOffices items={section.items} />
  }
}
