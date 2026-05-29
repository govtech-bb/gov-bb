// Content migration: give every service's start action a correct `startButton`
// block, following the two-step flow —
//   entry page  → its /start page   (type 'page')
//   /start page → the online form   (type 'form', form_id)
// A service with no /start page links its entry straight to the form.
//
// Handles both the migrated `<a data-start-link>…</a>` text placeholders and
// startButton blocks an earlier run produced, so it is idempotent and
// self-correcting. form_id was recovered from the pre-CMS markdown frontmatter.
//
// Dry run:  DRY_RUN=1 pnpm wire:start-buttons
// Apply:    pnpm wire:start-buttons
// Run per environment (the live site renders from the DB), then re-run
// `pnpm export:content`. Requires migration 20260529_000000 to have run first
// (the description validator needs pageRole='start' on /start docs).

import 'dotenv/config'
import crypto from 'crypto'
import { getPayload, type Payload } from 'payload'
import config from '../payload.config.js'

// Entry slug → form_id, recovered from the deleted per-page markdown frontmatter.
const FORM_BY_SLUG: Record<string, string> = {
  'apply-for-conductor-licence': 'apply-for-conductor-licence',
  'apply-to-be-a-project-protege-mentor': 'project-protege-mentor',
  'apply-to-jobstart-plus-programme': 'jobstart-plus-programme',
  'get-birth-certificate': 'get-birth-certificate',
  'get-death-certificate': 'get-death-certificate',
  'get-marriage-certificate': 'get-marriage-certificate',
  'post-office-redirection-business': 'post-office-redirection-business',
  'post-office-redirection-deceased': 'post-office-redirection-deceased',
  'post-office-redirection-individual': 'post-office-redirection-individual',
  'register-for-community-sports-training-programme': 'community-sports-training',
  'register-summer-camp': 'national-summer-camp-2025-registration',
  'sell-goods-services-beach-park': 'sell-goods-services-beach-park',
}

// Form ids present in the live forms manifest — only these services become
// `digital`, since only they have a Start now button that resolves today.
const LIVE_FORMS = new Set<string>([
  'apply-for-conductor-licence',
  'project-protege-mentor',
  'jobstart-plus-programme',
  'get-birth-certificate',
  'community-sports-training',
  'national-summer-camp-2025-registration',
  'sell-goods-services-beach-park',
])

const DRY = process.env.DRY_RUN === '1'
const PLACEHOLDER = /^<a\s+data-start-link\b[^>]*>.*<\/a>\s*$/i

interface LexNode {
  type?: string
  text?: string
  children?: LexNode[]
  fields?: Record<string, unknown>
  [k: string]: unknown
}

function isStartAction(node: LexNode): boolean {
  if (node?.type === 'block' && node.fields?.blockType === 'startButton') return true
  if (node?.type === 'paragraph' && Array.isArray(node.children) && node.children.length === 1) {
    const c = node.children[0]
    return c?.type === 'text' && typeof c.text === 'string' && PLACEHOLDER.test(c.text.trim())
  }
  return false
}

// The startButton fields this doc should end up with.
function targetFields(
  slug: string,
  base: string,
  hasStartPage: boolean,
  existingId?: string,
): Record<string, unknown> {
  const id = existingId ?? crypto.randomBytes(12).toString('hex')
  const common = { id, blockName: '', blockType: 'startButton', label: '' }
  // Entry page of a service that has a /start page → link to the start page.
  if (!slug.endsWith('/start') && hasStartPage) {
    return { ...common, type: 'page', url: `/${base}/start` }
  }
  // /start page, or an entry with no start page → link straight to the form.
  return { ...common, type: 'form', formId: FORM_BY_SLUG[base] }
}

// True when an existing startButton block already matches the target (so we can
// skip it and stay idempotent).
function alreadyCorrect(node: LexNode, fields: Record<string, unknown>): boolean {
  if (node.type !== 'block' || !node.fields) return false
  const f = node.fields
  return (
    f.type === fields.type &&
    (f.formId ?? undefined) === (fields.formId ?? undefined) &&
    (f.url ?? undefined) === (fields.url ?? undefined)
  )
}

async function run(): Promise<void> {
  const payload: Payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'services',
    where: { _status: { equals: 'published' } },
    limit: 1000,
    depth: 0,
  })
  const docs = res.docs as unknown as Array<Record<string, unknown>>

  const hasStartPage = new Set(
    docs
      .map((d) => String(d.slug))
      .filter((s) => s.endsWith('/start'))
      .map((s) => s.slice(0, -'/start'.length)),
  )

  let changed = 0
  let toDigital = 0

  for (const doc of docs) {
    const slug = String(doc.slug)
    const base = slug.replace(/\/start$/, '')
    if (!FORM_BY_SLUG[base]) continue

    const body = doc.body as { root?: { children?: LexNode[] } } | null
    const children = body?.root?.children
    if (!Array.isArray(children)) continue

    let touched = 0
    const next = children.map((child) => {
      if (!isStartAction(child)) return child
      const fields = targetFields(
        slug,
        base,
        hasStartPage.has(base),
        child.type === 'block' ? (child.fields?.id as string | undefined) : undefined,
      )
      if (alreadyCorrect(child, fields)) return child
      touched++
      return { type: 'block', version: 2, format: '', fields }
    })
    if (touched === 0) continue

    const goDigital = LIVE_FORMS.has(FORM_BY_SLUG[base]) && doc.serviceType !== 'digital'
    changed++
    if (goDigital) toDigital++
    const dest =
      slug.endsWith('/start') || !hasStartPage.has(base)
        ? `form ${FORM_BY_SLUG[base]}`
        : `/${base}/start`
    console.log(`${DRY ? '[dry] ' : ''}${slug}: → ${dest}${goDigital ? '  +digital' : ''}`)
    if (DRY) continue

    await payload.update({
      collection: 'services',
      id: doc.id as number,
      data: {
        body: { ...(body as object), root: { ...body!.root, children: next } },
        _status: 'published',
        ...(goDigital ? { serviceType: 'digital' } : {}),
      },
    } as Parameters<typeof payload.update>[0])
  }

  console.log(`\n${DRY ? '[dry] would change' : 'changed'} ${changed} docs, ${toDigital} → digital`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
