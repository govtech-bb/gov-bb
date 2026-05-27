// Maps Payload documents to the YAML frontmatter shape the landing app and
// packages/content read. The contract test runs the output of these functions
// through packages/content's canonical zod schemas, so a schema change there
// fails CI until the mapping (and the collection feeding it) is updated.

type Ref = string | number | { slug?: string | null }
type Upload = string | number | { url?: string | null; filename?: string | null }

export interface MappedFile {
  data: Record<string, unknown>
  body: string
}

const slugOf = (ref: Ref | null | undefined): string | undefined =>
  ref && typeof ref === 'object' ? (ref.slug ?? undefined) : undefined

const urlOf = (ref: Upload | null | undefined): string | undefined => {
  if (!ref || typeof ref !== 'object') return undefined
  return ref.url ?? ref.filename ?? undefined
}

const isoDate = (value: unknown): string | undefined => {
  if (!value) return undefined
  const d = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
}

export interface ServiceDoc {
  title: string
  description?: string | null
  body?: string | null
  categories?: Ref[] | null
  subcategory?: Ref | null
  serviceType?: 'digital' | 'information' | null
  stage?: 'alpha' | null
  featured?: boolean | null
  section?: string | null
  formId?: string | null
  sourceUrl?: string | null
  publishDate?: string | null
}

export function serviceDocToFrontmatter(doc: ServiceDoc): MappedFile {
  const data: Record<string, unknown> = { title: doc.title }
  if (doc.description) data.description = doc.description

  const categories = (doc.categories ?? []).map(slugOf).filter((s): s is string => Boolean(s))
  if (categories.length) data.categories = categories

  const subcategory = slugOf(doc.subcategory)
  if (subcategory) data.subcategory = subcategory

  if (doc.section) data.section = doc.section
  if (doc.serviceType) data.service_type = doc.serviceType
  if (doc.stage) data.stage = doc.stage
  if (doc.featured) data.featured = true
  if (doc.formId) data.form_id = doc.formId
  if (doc.sourceUrl) data.source_url = doc.sourceUrl
  const publishDate = isoDate(doc.publishDate)
  if (publishDate) data.publish_date = publishDate

  return { data, body: doc.body ?? '' }
}

interface ContactBlock {
  blockType: string
  label?: string | null
  value?: string | null
  display?: string | null
  lines?: string | null
}

interface OnlineServiceBlock {
  blockType: string
  title?: string | null
  href?: string | null
  description?: string | null
  formId?: string | null
  label?: string | null
}

export interface OrganisationDoc {
  kind: 'ministry' | 'department' | 'state-body'
  slug: string
  name: string
  body?: string | null
  shortDescription?: string | null
  intro?: string | null
  category?: string | null
  keywords?: Array<{ value?: string | null }> | null
  leader?: { name?: string | null; role?: string | null; photo?: Upload | null } | null
  heroImage?: Upload | null
  contact?: ContactBlock[] | null
  onlineServices?: OnlineServiceBlock[] | null
  featured?: Array<{
    title?: string | null
    href?: string | null
    description?: string | null
    image?: Upload | null
    imageAlt?: string | null
  }> | null
  services?: Array<{
    title?: string | null
    href?: string | null
    description?: string | null
  }> | null
  associatedDepartments?: Array<{
    category?: string | null
    items?: Array<{ name?: string | null; slug?: string | null }> | null
  }> | null
  originalSource?: string | null
}

const mapContact = (block: ContactBlock): Record<string, unknown> | undefined => {
  const base: Record<string, unknown> = {}
  if (block.label) base.label = block.label
  switch (block.blockType) {
    case 'phone':
    case 'email':
      return { ...base, type: block.blockType, value: block.value ?? '' }
    case 'website':
      return {
        ...base,
        type: 'website',
        value: block.value ?? '',
        ...(block.display ? { display: block.display } : {}),
      }
    case 'address':
      return {
        ...base,
        type: 'address',
        value: (block.lines ?? '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      }
    default:
      return undefined
  }
}

const mapOnlineService = (block: OnlineServiceBlock): Record<string, unknown> | undefined => {
  if (block.blockType === 'linkService') {
    return {
      title: block.title ?? '',
      href: block.href ?? '',
      ...(block.description ? { description: block.description } : {}),
    }
  }
  if (block.blockType === 'formService') {
    return { formId: block.formId ?? '', ...(block.label ? { label: block.label } : {}) }
  }
  return undefined
}

export function organisationDocToFrontmatter(doc: OrganisationDoc): MappedFile {
  const data: Record<string, unknown> = { kind: doc.kind, slug: doc.slug, name: doc.name }
  if (doc.shortDescription) data.shortDescription = doc.shortDescription
  if (doc.intro) data.intro = doc.intro
  if (doc.kind === 'ministry' && doc.category) data.category = doc.category

  const keywords = (doc.keywords ?? []).map((k) => k.value).filter((v): v is string => Boolean(v))
  if (keywords.length) data.keywords = keywords

  if (doc.leader?.name) {
    const leader: Record<string, unknown> = { name: doc.leader.name }
    if (doc.leader.role) leader.role = doc.leader.role
    const photo = urlOf(doc.leader.photo)
    if (photo) leader.photo = photo
    data[doc.kind === 'ministry' ? 'minister' : 'head'] = leader
  }

  const hero = urlOf(doc.heroImage)
  if (hero) data.heroImage = hero

  const contact = (doc.contact ?? []).map(mapContact).filter(Boolean)
  if (contact.length) data.contact = contact

  const onlineServices = (doc.onlineServices ?? []).map(mapOnlineService).filter(Boolean)
  if (onlineServices.length) data.onlineServices = onlineServices

  if (doc.kind === 'ministry') {
    const featured = (doc.featured ?? []).map((f) => ({
      title: f.title ?? '',
      href: f.href ?? '',
      description: f.description ?? '',
      ...(urlOf(f.image) ? { image: urlOf(f.image) } : {}),
      ...(f.imageAlt ? { imageAlt: f.imageAlt } : {}),
    }))
    if (featured.length) data.featured = featured

    const services = (doc.services ?? []).map((s) => ({
      title: s.title ?? '',
      href: s.href ?? '',
      ...(s.description ? { description: s.description } : {}),
    }))
    if (services.length) data.services = services
  }

  const associated = (doc.associatedDepartments ?? []).map((g) => ({
    ...(g.category ? { category: g.category } : {}),
    items: (g.items ?? []).map((i) =>
      i.slug ? { name: i.name ?? '', slug: i.slug } : { name: i.name ?? '' },
    ),
  }))
  if (associated.length) data.associatedDepartments = associated

  if (doc.originalSource) data.originalSource = doc.originalSource

  return { data, body: doc.body ?? '' }
}
