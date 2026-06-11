import { Text, linkVariants } from '@govtech-bb/react'
import type { MarkdownHeading } from '../../utils/markdown/plugins'

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
