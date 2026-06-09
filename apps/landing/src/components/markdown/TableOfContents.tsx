import { Text, linkVariants } from '@govtech-bb/react'
import type { MarkdownHeading } from '../../utils/markdown/plugins'

/**
 * GOV.UK-style "Contents" list, rendered in `MarkdownContent`'s spare third
 * column from the headings collected at build (see `collectHeadings`). Static
 * (not sticky): a blue top rule, a bold "Contents" title, and separated section
 * links. Lists top-level (`h2`) sections; hidden when a page has fewer than two,
 * where it would add noise rather than help.
 */
export function TableOfContents({
  headings,
}: {
  headings: Array<MarkdownHeading>
}) {
  const sections = headings.filter((h) => h.level === 2)
  if (sections.length < 2) return null

  return (
    <nav aria-label="Contents" className="hidden border-t-2 border-blue-100 lg:block">
      <Text as="p" className="pt-2 font-bold">
        Contents
      </Text>
      <ul className="m-0 mt-1 list-none p-0">
        {sections.map((h) => (
          <li key={h.id} className="border-b border-grey-00 py-2">
            <a href={`#${h.id}`} className={linkVariants()}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
