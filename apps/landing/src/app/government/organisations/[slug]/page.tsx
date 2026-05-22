import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { MarkdownBody } from '@/components/MarkdownContent'
import { MinistryPage } from '@/components/MinistryPage'
import { ORG_PAGE_BY_SLUG, resolveOrgProps } from '@/content/orgs'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const found = ORG_PAGE_BY_SLUG.get(slug)
  if (!found?.page) return {}
  const fm = found.page.frontmatter
  return {
    title: fm.title,
    description: fm.description,
  }
}

export function generateStaticParams() {
  return Array.from(ORG_PAGE_BY_SLUG.keys()).map((slug) => ({ slug }))
}

export default async function OrganisationDetail({ params }: PageProps) {
  const { slug } = await params
  const found = ORG_PAGE_BY_SLUG.get(slug)
  if (!found) notFound()

  const { kind, page } = found
  const props = resolveOrgProps(kind, slug, {
    title: page?.frontmatter.title ?? slug,
    originalSource: page?.frontmatter.source_url,
  })

  return (
    <MinistryPage
      {...props}
      body={page ? <MarkdownBody body={page.body} /> : null}
    />
  )
}
