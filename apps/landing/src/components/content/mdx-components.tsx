import { LinkButton } from '@govtech-bb/react'
import { markdownComponents } from '../markdown/MdComponents'
import { Highlights, Highlight } from './Highlights'
import { Contacts, Contact } from './Contacts'
import { Notice } from './Notice'
import { Section } from './Section'
import { Muted } from './Muted'

/**
 * The curated palette an `.mdx` content page may use. Plain markdown elements
 * inherit the same design-system mapping as `.md` pages (markdownComponents);
 * the named entries are the approved blocks authors drop in as JSX tags.
 */
export const mdxComponents = {
  ...markdownComponents,
  LinkButton,
  Highlights,
  Highlight,
  Contacts,
  Contact,
  Notice,
  Section,
  Muted,
}
