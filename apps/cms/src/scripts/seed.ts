// One-time import of the landing app's markdown content into Payload.
// Idempotent: re-running updates existing docs (matched by slug) rather than
// duplicating them. Run with: pnpm seed
//
// Env:
//   CMS_ADMIN_EMAIL / CMS_ADMIN_PASSWORD — seed an initial admin (optional)
//   CONTENT_DIR — override the markdown source directory (optional)

import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import { pathToFileURL } from 'url'
import { getPayload, type Payload } from 'payload'
import {
  convertMarkdownToLexical,
  type SanitizedServerEditorConfig,
} from '@payloadcms/richtext-lexical'
import config from '../payload.config.js'
import { CONTENT_DIR, ORGANISATIONS_DIR } from './content-paths.js'
import { getBodyEditorConfig } from '../lib/body-editor.js'
import { EMPTY_EDITOR_STATE } from '@govtech-bb/content/map'

interface SeedCategory {
  slug: string
  title: string
  description?: string
  subcategories?: Array<{ slug: string; title: string; description?: string }>
}

// Loaded at runtime from the content directory (not a static import) so the CMS
// build doesn't depend on the landing app's source being present.
async function loadCategories(): Promise<SeedCategory[]> {
  const url = pathToFileURL(path.join(CONTENT_DIR, 'categories.ts')).href
  const mod = (await import(url)) as { CATEGORIES: SeedCategory[] }
  return mod.CATEGORIES
}

async function walkMarkdown(dir: string, exclude: string[] = []): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (exclude.some((e) => full.startsWith(e))) continue
    if (entry.isDirectory()) out.push(...(await walkMarkdown(full, exclude)))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

const serviceSlug = (file: string): string =>
  path
    .relative(CONTENT_DIR, file)
    .replace(/\\/g, '/')
    .replace(/\/index\.md$/, '')
    .replace(/\.md$/, '')

async function upsert(
  payload: Payload,
  collection: 'services' | 'organisations' | 'categories' | 'subcategories',
  slug: string,
  data: Record<string, unknown>,
): Promise<string | number> {
  const existing = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs[0]) {
    const updated = await payload.update({
      collection,
      id: existing.docs[0].id,
      data,
    } as Parameters<typeof payload.update>[0])
    return updated.id
  }
  const created = await payload.create({ collection, data } as Parameters<typeof payload.create>[0])
  return created.id
}

async function seedTaxonomy(payload: Payload): Promise<Map<string, string | number>> {
  const categoryIds = new Map<string, string | number>()
  const categories = await loadCategories()
  for (const [index, cat] of categories.entries()) {
    const id = await upsert(payload, 'categories', cat.slug, {
      slug: cat.slug,
      title: cat.title,
      description: cat.description,
      order: index,
    })
    categoryIds.set(cat.slug, id)
    for (const sub of cat.subcategories ?? []) {
      await upsert(payload, 'subcategories', sub.slug, {
        slug: sub.slug,
        title: sub.title,
        description: sub.description,
        parent: id,
      })
    }
  }
  return categoryIds
}

async function subcategoryId(payload: Payload, slug: string): Promise<string | number | undefined> {
  const found = await payload.find({
    collection: 'subcategories',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })
  return found.docs[0]?.id
}

const mdToBody = (markdown: string, editorConfig: SanitizedServerEditorConfig) =>
  markdown.trim()
    ? convertMarkdownToLexical({ editorConfig, markdown: markdown.trim() })
    : EMPTY_EDITOR_STATE

async function seedServices(
  payload: Payload,
  categoryIds: Map<string, string | number>,
  editorConfig: SanitizedServerEditorConfig,
): Promise<void> {
  const files = await walkMarkdown(CONTENT_DIR, [ORGANISATIONS_DIR])
  for (const file of files) {
    const slug = serviceSlug(file)
    const { data: fm, content } = matter(await fs.readFile(file, 'utf8'))
    const catSlugs: string[] = [
      ...(fm.category ? [fm.category] : []),
      ...(Array.isArray(fm.categories) ? fm.categories : []),
    ]
    const categories = catSlugs.map((s) => categoryIds.get(s)).filter(Boolean)
    const subId = fm.subcategory ? await subcategoryId(payload, fm.subcategory) : undefined
    await upsert(payload, 'services', slug, {
      slug,
      title: fm.title ?? slug,
      description: fm.description,
      body: mdToBody(content, editorConfig),
      categories,
      subcategory: subId,
      serviceType: fm.service_type ?? 'information',
      formId: fm.form_id,
      stage: fm.stage ?? 'alpha',
      sourceUrl: fm.source_url,
      _status: 'published',
    })
  }
  console.log(`Seeded ${files.length} services`)
}

function contactBlocksFromFm(contact: unknown): unknown[] {
  if (!Array.isArray(contact)) return []
  return contact
    .map((c: Record<string, unknown>) => {
      const label = typeof c.label === 'string' ? c.label : undefined
      const type = c.type
      if (type === 'address') {
        const lines = Array.isArray(c.value) ? c.value.join('\n') : String(c.value ?? '')
        return { blockType: 'address', label, lines }
      }
      if (type === 'website') {
        return { blockType: 'website', label, value: String(c.value ?? '') }
      }
      if (type === 'email' || type === 'phone') {
        return { blockType: type, label, value: String(c.value ?? '') }
      }
      return undefined
    })
    .filter(Boolean) as unknown[]
}

function onlineServiceBlocksFromFm(services: unknown): unknown[] {
  if (!Array.isArray(services)) return []
  return services.map((s: Record<string, unknown>) =>
    'formId' in s
      ? { blockType: 'formService', formId: s.formId, label: s.label }
      : { blockType: 'linkService', title: s.title, href: s.href, description: s.description },
  )
}

async function seedOrganisations(
  payload: Payload,
  editorConfig: SanitizedServerEditorConfig,
): Promise<void> {
  const files = await walkMarkdown(ORGANISATIONS_DIR)
  for (const file of files) {
    const { data: fm, content } = matter(await fs.readFile(file, 'utf8'))
    if (!fm.slug || !fm.name || !fm.kind) continue
    const leaderSource = fm.minister ?? fm.head
    const associated = Array.isArray(fm.associatedDepartments)
      ? fm.associatedDepartments.map((g: Record<string, unknown>) => ({
          category: g.category,
          items: (Array.isArray(g.items) ? g.items : []).map((i: unknown) =>
            typeof i === 'string'
              ? { name: i }
              : { name: (i as { name?: string }).name, slug: (i as { slug?: string }).slug },
          ),
        }))
      : []
    const social = Array.isArray(fm.social)
      ? fm.social
          .map((s: Record<string, unknown>) => ({
            platform: typeof s.platform === 'string' ? s.platform : undefined,
            url: typeof s.url === 'string' ? s.url : undefined,
          }))
          .filter((s) => s.platform && s.url)
      : []
    await upsert(payload, 'organisations', fm.slug, {
      slug: fm.slug,
      name: fm.name,
      kind: fm.kind,
      stage: fm.stage ?? 'alpha',
      category: fm.category,
      shortDescription: fm.shortDescription,
      intro: fm.intro,
      keywords: Array.isArray(fm.keywords) ? fm.keywords.map((value: string) => ({ value })) : [],
      leader: leaderSource ? { name: leaderSource.name, role: leaderSource.role } : undefined,
      contact: contactBlocksFromFm(fm.contact),
      onlineServices: onlineServiceBlocksFromFm(fm.onlineServices),
      social,
      associatedDepartments: associated,
      originalSource: fm.originalSource,
      body: mdToBody(content, editorConfig),
      _status: 'published',
    })
  }
  console.log(`Seeded ${files.length} organisations`)
}

async function seedAdmin(payload: Payload): Promise<void> {
  const email = process.env.CMS_ADMIN_EMAIL
  const password = process.env.CMS_ADMIN_PASSWORD
  if (!email || !password) {
    console.log('Skipping admin seed (set CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD to create one)')
    return
  }
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })
  if (existing.docs[0]) {
    console.log(`Admin ${email} already exists`)
    return
  }
  await payload.create({
    collection: 'users',
    data: { email, password, name: 'Admin', role: 'admin' },
  })
  console.log(`Created admin ${email}`)
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  await seedAdmin(payload)
  const editorConfig = await getBodyEditorConfig(payload.config)
  const categoryIds = await seedTaxonomy(payload)
  await seedServices(payload, categoryIds, editorConfig)
  await seedOrganisations(payload, editorConfig)
  console.log('Seed complete')
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
