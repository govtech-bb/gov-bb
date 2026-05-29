// One-off content migration: replace the migrated `<a data-start-link>…</a>`
// text placeholders in service bodies with real `startButton` blocks, using the
// form_id recovered from the pre-CMS markdown frontmatter (git history).
//
// Idempotent: a second run finds no placeholders and changes nothing.
// Dry run:  DRY_RUN=1 pnpm wire:start-buttons
// Apply:    pnpm wire:start-buttons
//
// Run again in each environment (the live site renders from the DB, not the
// exported JSON). After applying, re-run `pnpm export:content`.

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

// Form ids present in the live forms manifest — only these become `digital`,
// since only they have a Start now button that actually renders today.
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
  [k: string]: unknown
}

function isPlaceholder(node: LexNode): boolean {
  if (node?.type !== 'paragraph' || !Array.isArray(node.children)) return false
  if (node.children.length !== 1) return false
  const c = node.children[0]
  return c?.type === 'text' && typeof c.text === 'string' && PLACEHOLDER.test(c.text.trim())
}

function startButton(formId: string): LexNode {
  return {
    type: 'block',
    version: 2,
    format: '',
    fields: {
      id: crypto.randomBytes(12).toString('hex'),
      blockName: '',
      blockType: 'startButton',
      type: 'form',
      formId,
      label: '',
    },
  }
}

async function run(): Promise<void> {
  const payload: Payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'services',
    where: { _status: { equals: 'published' } },
    limit: 1000,
    depth: 0,
  })

  let docs = 0
  let buttons = 0
  let digital = 0

  for (const doc of res.docs as unknown as Array<Record<string, unknown>>) {
    const baseSlug = String(doc.slug).replace(/\/start$/, '')
    const formId = FORM_BY_SLUG[baseSlug]
    if (!formId) continue

    const body = doc.body as { root?: { children?: LexNode[] } } | null
    const children = body?.root?.children
    if (!Array.isArray(children)) continue

    let replaced = 0
    const next = children.map((child) => {
      if (isPlaceholder(child)) {
        replaced++
        return startButton(formId)
      }
      return child
    })
    if (replaced === 0) continue

    const goDigital = LIVE_FORMS.has(formId) && doc.serviceType !== 'digital'
    docs++
    buttons += replaced
    if (goDigital) digital++
    console.log(
      `${DRY ? '[dry] ' : ''}${doc.slug}: ${replaced} → ${formId}${goDigital ? '  +digital' : ''}`,
    )
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

  console.log(
    `\n${DRY ? '[dry] would change' : 'changed'} ${docs} docs, ${buttons} start buttons, ${digital} → digital`,
  )
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
