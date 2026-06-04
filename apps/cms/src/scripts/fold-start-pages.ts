// One-off migration to the one-document service model. For each `<slug>/start`
// document: move its body into the parent service's `startBody`, set the
// parent's start action (startType + formId or startUrl), strip the redundant
// startButton blocks from both bodies, then delete the /start document.
// Digital services that never had a /start page just get their start action set.
//
// A service is digital because it has a start action — a Form Builder form, or
// a link (e.g. the severance/pension calculator route, or an external form).
//
// Every form_id below is validated against the live forms API before anything
// is written: a service whose form_id isn't a published form is folded as
// information-only (content kept, no start action) rather than wired to a Start
// now button the landing manifest would silently suppress. The unresolved ones
// are reported at the end. Set the API with FORMS_API_URL; SKIP_FORM_VALIDATION=1
// bypasses the check (e.g. offline), and an unreachable API fails before any DB write.
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

// Same endpoint the landing build-time manifest uses (apps/landing/scripts/
// fetch-form-manifest.mjs): GET /form-definitions → { status, data: [{ formId }] }.
const FORMS_API_BASE = (
  process.env.FORMS_API_URL ||
  process.env.VITE_FORMS_API_URL ||
  'https://forms.api.sandbox.alpha.gov.bb'
).replace(/\/+$/, '')

// Set of published form_ids, or null when validation is skipped. An unreachable
// or malformed API throws — the script then exits before touching the DB.
async function fetchLiveFormIds(): Promise<Set<string> | null> {
  if (process.env.SKIP_FORM_VALIDATION === '1') {
    console.warn('! SKIP_FORM_VALIDATION=1 — form_ids will NOT be checked against the forms API')
    return null
  }
  const endpoint = `${FORMS_API_BASE}/form-definitions`
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`forms API returned HTTP ${res.status} at ${endpoint}`)
  const json = (await res.json()) as { status?: string; data?: Array<{ formId?: string }> }
  if (json.status !== 'success' || !Array.isArray(json.data))
    throw new Error(`unexpected forms API response shape from ${endpoint}`)
  return new Set(json.data.map((d) => d?.formId).filter((v): v is string => Boolean(v)))
}

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
  const liveIds = await fetchLiveFormIds()
  const unresolved: Array<{ slug: string; formId: string }> = []

  // Drop a form action whose form_id isn't a published form — keep the content
  // but leave the service information-only rather than wire a dead button.
  const validate = (slug: string, action: Action): Action => {
    if (action.startType === 'form' && action.formId && liveIds && !liveIds.has(action.formId)) {
      unresolved.push({ slug, formId: action.formId })
      return {}
    }
    return action
  }

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
    const validated = validate(baseSlug, action)
    const startBody = stripStartButtons(start.body as Body)
    const parentBody = stripStartButtons(parent.body as Body)
    const dest = validated.startType
      ? `${validated.startType} ${validated.formId ?? validated.startUrl}`
      : action.startType === 'form'
        ? 'content only (form_id not published — see report)'
        : 'content only'
    console.log(`${DRY ? '[dry] ' : ''}fold ${start.slug} → ${baseSlug} (${dest})`)
    if (DRY) continue
    await payload.update({
      collection: 'services',
      id: parent.id as number,
      data: { startBody, ...validated, body: parentBody, _status: 'published' },
    } as Parameters<typeof payload.update>[0])
    await payload.delete({ collection: 'services', id: start.id as number })
  }

  // 2. Digital services with no /start page: set the start action, strip blocks.
  for (const base of [...Object.keys(FORM_BY_SLUG), ...Object.keys(LINK_BY_SLUG)]) {
    const doc = bySlug.get(base)
    if (!doc || doc.startType || bySlug.has(`${base}/start`)) continue
    const action = validate(base, actionFor(base))
    if (!action.startType) {
      console.warn(`! skip entry ${base} — form_id not published (see report)`)
      continue
    }
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

  if (unresolved.length) {
    console.warn(
      `\n⚠ ${unresolved.length} service(s) folded as information-only — form_id not a published form at ${FORMS_API_BASE}:`,
    )
    for (const u of unresolved) console.warn(`    ${u.slug} → ${u.formId}`)
    console.warn(
      '  Fix: publish the form, correct the id in FORM_BY_SLUG, or set the start action in the admin Start page tab, then re-run.',
    )
  }

  console.log(`\n${DRY ? '[dry] ' : ''}done`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
