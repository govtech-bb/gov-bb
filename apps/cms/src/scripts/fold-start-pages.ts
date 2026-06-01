// One-off migration to the one-document service model. For each `<slug>/start`
// document: move its body into the parent service's `startBody`, set the
// parent's start action (startType + formId or startUrl), strip the redundant
// startButton blocks from both bodies, then delete the /start document.
// Digital services that never had a /start page just get their start action set.
//
// A service is digital because it has a start action — a Form Builder form, or
// a link (e.g. the severance/pension calculator route, or an external form).
//
// Idempotent: once folded, the /start docs are gone and wired parents are
// skipped. Dry run: DRY_RUN=1 pnpm fold:start-pages. Apply: pnpm fold:start-pages.
// Run per environment, then re-run `pnpm export:content`. Needs migration first.

import 'dotenv/config'
import { getPayload, type Payload } from 'payload'
import config from '../payload.config.js'

// Entry slug → Form Builder form_id (recovered from the pre-CMS markdown).
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

// Entry slug → link target (a calculator route on this site, or external form).
const LINK_BY_SLUG: Record<string, string> = {
  'calculate-severance-pay': '/money-financial-support/calculate-severance-pay/form',
  'calculate-your-pension': '/pensions-and-gratuities/calculate-your-pension/form',
}

const DRY = process.env.DRY_RUN === '1'

interface LexNode {
  type?: string
  fields?: Record<string, unknown>
  [k: string]: unknown
}
type Body = { root?: { children?: LexNode[] } } | null | undefined

const isStartButton = (n: LexNode): boolean =>
  n?.type === 'block' && n.fields?.blockType === 'startButton'

function stripStartButtons(body: Body): Body {
  const children = body?.root?.children
  if (!Array.isArray(children)) return body
  return {
    ...(body as object),
    root: { ...body!.root, children: children.filter((n) => !isStartButton(n)) },
  }
}

function formIdFromBody(body: Body): string | undefined {
  const block = (body?.root?.children ?? []).find(isStartButton)
  const id = block?.fields?.formId
  return typeof id === 'string' && id ? id : undefined
}

type Action = { startType?: 'form' | 'link'; formId?: string; startUrl?: string }

function actionFor(base: string): Action {
  if (FORM_BY_SLUG[base]) return { startType: 'form', formId: FORM_BY_SLUG[base] }
  if (LINK_BY_SLUG[base]) return { startType: 'link', startUrl: LINK_BY_SLUG[base] }
  return {}
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
  const bySlug = new Map(docs.map((d) => [String(d.slug), d]))

  // 1. Fold each /start doc into its parent.
  for (const start of docs.filter((d) => String(d.slug).endsWith('/start'))) {
    const baseSlug = String(start.slug).slice(0, -'/start'.length)
    const parent = bySlug.get(baseSlug)
    if (!parent) {
      console.warn(`! no parent for ${start.slug} — skipped`)
      continue
    }
    const action = actionFor(baseSlug)
    if (action.startType === 'form' && !action.formId)
      action.formId = formIdFromBody(start.body as Body)
    const startBody = stripStartButtons(start.body as Body)
    const parentBody = stripStartButtons(parent.body as Body)
    const dest = action.startType
      ? `${action.startType} ${action.formId ?? action.startUrl}`
      : 'content only'
    console.log(`${DRY ? '[dry] ' : ''}fold ${start.slug} → ${baseSlug} (${dest})`)
    if (DRY) continue
    await payload.update({
      collection: 'services',
      id: parent.id as number,
      data: { startBody, ...action, body: parentBody, _status: 'published' },
    } as Parameters<typeof payload.update>[0])
    await payload.delete({ collection: 'services', id: start.id as number })
  }

  // 2. Digital services with no /start page: set the start action, strip blocks.
  for (const base of [...Object.keys(FORM_BY_SLUG), ...Object.keys(LINK_BY_SLUG)]) {
    const doc = bySlug.get(base)
    if (!doc || doc.startType || bySlug.has(`${base}/start`)) continue
    const action = actionFor(base)
    const body = stripStartButtons(doc.body as Body)
    const dest = `${action.startType} ${action.formId ?? action.startUrl}`
    console.log(`${DRY ? '[dry] ' : ''}wire entry ${base} → ${dest}`)
    if (DRY) continue
    await payload.update({
      collection: 'services',
      id: doc.id as number,
      data: { ...action, body, _status: 'published' },
    } as Parameters<typeof payload.update>[0])
  }

  console.log(`\n${DRY ? '[dry] ' : ''}done`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
