// Maps Payload documents to the frontmatter shape the landing app reads. Shared
// by the CMS export script (apps/cms) and the landing live-preview route so both
// transform a Payload doc identically. Pure and browser-safe — only a type
// import from `lexical`, no `node:fs`.

import type { SerializedEditorState } from "lexical";

type Ref = string | number | { slug?: string | null };
type Upload =
  | string
  | number
  | { url?: string | null; filename?: string | null };

export interface MappedFile {
  data: Record<string, unknown>;
  body: SerializedEditorState;
}

// A valid empty editor state: Lexical requires the root to always hold at least
// one child, so seed an empty paragraph.
export const EMPTY_EDITOR_STATE = {
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children: [
      {
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        children: [],
      },
    ],
  },
} as unknown as SerializedEditorState;

const slugOf = (ref: Ref | null | undefined): string | undefined =>
  ref && typeof ref === "object" ? (ref.slug ?? undefined) : undefined;

const urlOf = (ref: Upload | null | undefined): string | undefined => {
  if (!ref || typeof ref !== "object") return undefined;
  return ref.url ?? ref.filename ?? undefined;
};

const isoDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

export interface ServiceDoc {
  title: string;
  description?: string | null;
  body?: SerializedEditorState | null;
  categories?: Ref[] | null;
  subcategory?: Ref | null;
  startType?: "form" | "link" | null;
  startBody?: SerializedEditorState | null;
  formId?: string | null;
  startUrl?: string | null;
  stage?: "alpha" | "beta" | "migrated" | null;
  sourceUrl?: string | null;
  updatedAt?: string | null;
}

export function serviceDocToFrontmatter(doc: ServiceDoc): MappedFile {
  const data: Record<string, unknown> = { title: doc.title };
  if (doc.description) data.description = doc.description;

  const categories = (doc.categories ?? [])
    .map(slugOf)
    .filter((s): s is string => Boolean(s));
  if (categories.length) data.categories = categories;

  const subcategory = slugOf(doc.subcategory);
  if (subcategory) data.subcategory = subcategory;

  if (doc.startType) data.start_type = doc.startType;
  if (doc.formId) data.form_id = doc.formId;
  if (doc.startUrl) data.start_url = doc.startUrl;
  if (doc.stage) data.stage = doc.stage;
  if (doc.sourceUrl) data.source_url = doc.sourceUrl;
  const updatedAt = isoDate(doc.updatedAt);
  if (updatedAt) data.updated_at = updatedAt;

  return { data, body: doc.body ?? EMPTY_EDITOR_STATE };
}

interface ContactBlock {
  blockType: string;
  label?: string | null;
  value?: string | null;
  display?: string | null;
  lines?: string | null;
}

interface OnlineServiceBlock {
  blockType: string;
  title?: string | null;
  href?: string | null;
  description?: string | null;
  formId?: string | null;
  label?: string | null;
}

export interface OrganisationDoc {
  kind: "ministry" | "department" | "state-body";
  slug: string;
  name: string;
  stage?: "alpha" | "beta" | "migrated" | null;
  body?: SerializedEditorState | null;
  shortDescription?: string | null;
  intro?: string | null;
  category?: string | null;
  keywords?: Array<{ value?: string | null }> | null;
  leader?: {
    name?: string | null;
    role?: string | null;
  } | null;
  heroImage?: Upload | null;
  social?: Array<{ platform?: string | null; url?: string | null }> | null;
  contact?: ContactBlock[] | null;
  onlineServices?: OnlineServiceBlock[] | null;
  featured?: Array<{
    title?: string | null;
    href?: string | null;
    description?: string | null;
    image?: Upload | null;
    imageAlt?: string | null;
  }> | null;
  // `services` is a relationship to the services collection. Exported with
  // depth, each entry is the populated service doc; unpopulated entries (bare
  // ids) are skipped since we can't resolve a slug from them.
  services?: Array<
    | string
    | number
    | {
        slug?: string | null;
        title?: string | null;
        description?: string | null;
      }
  > | null;
  associatedDepartments?: Array<{
    category?: string | null;
    items?: Array<{ name?: string | null; slug?: string | null }> | null;
  }> | null;
  originalSource?: string | null;
}

const mapContact = (
  block: ContactBlock,
): Record<string, unknown> | undefined => {
  const base: Record<string, unknown> = {};
  if (block.label) base.label = block.label;
  switch (block.blockType) {
    case "phone":
    case "email":
      return { ...base, type: block.blockType, value: block.value ?? "" };
    case "website":
      return {
        ...base,
        type: "website",
        value: block.value ?? "",
        ...(block.display ? { display: block.display } : {}),
      };
    case "address":
      return {
        ...base,
        type: "address",
        value: (block.lines ?? "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      };
    default:
      return undefined;
  }
};

const mapOnlineService = (
  block: OnlineServiceBlock,
): Record<string, unknown> | undefined => {
  if (block.blockType === "linkService") {
    return {
      title: block.title ?? "",
      href: block.href ?? "",
      ...(block.description ? { description: block.description } : {}),
    };
  }
  if (block.blockType === "formService") {
    return {
      formId: block.formId ?? "",
      ...(block.label ? { label: block.label } : {}),
    };
  }
  return undefined;
};

export function organisationDocToFrontmatter(doc: OrganisationDoc): MappedFile {
  const data: Record<string, unknown> = {
    kind: doc.kind,
    slug: doc.slug,
    name: doc.name,
  };
  if (doc.stage) data.stage = doc.stage;
  if (doc.shortDescription) data.shortDescription = doc.shortDescription;
  if (doc.intro) data.intro = doc.intro;
  if (doc.kind === "ministry" && doc.category) data.category = doc.category;

  const keywords = (doc.keywords ?? [])
    .map((k) => k.value)
    .filter((v): v is string => Boolean(v));
  if (keywords.length) data.keywords = keywords;

  if (doc.leader?.name) {
    const leader: Record<string, unknown> = { name: doc.leader.name };
    if (doc.leader.role) leader.role = doc.leader.role;
    data[doc.kind === "ministry" ? "minister" : "head"] = leader;
  }

  const hero = urlOf(doc.heroImage);
  if (hero) data.heroImage = hero;

  const social = (doc.social ?? [])
    .filter((s) => s.platform && s.url)
    .map((s) => ({ platform: s.platform ?? "", url: s.url ?? "" }));
  if (social.length) data.social = social;

  const contact = (doc.contact ?? []).map(mapContact).filter(Boolean);
  if (contact.length) data.contact = contact;

  const onlineServices = (doc.onlineServices ?? [])
    .map(mapOnlineService)
    .filter(Boolean);
  if (onlineServices.length) data.onlineServices = onlineServices;

  if (doc.kind === "ministry") {
    const featured = (doc.featured ?? []).map((f) => ({
      title: f.title ?? "",
      href: f.href ?? "",
      description: f.description ?? "",
      ...(urlOf(f.image) ? { image: urlOf(f.image) } : {}),
      ...(f.imageAlt ? { imageAlt: f.imageAlt } : {}),
    }));
    if (featured.length) data.featured = featured;

    const services = (doc.services ?? [])
      .filter(
        (
          s,
        ): s is {
          slug?: string | null;
          title?: string | null;
          description?: string | null;
        } => Boolean(s) && typeof s === "object",
      )
      .map((s) => ({
        title: s.title ?? "",
        // Leading slash so the landing's resolveServiceHref resolves the slug to
        // its category-prefixed URL; a bare slug returns unresolved (broken link).
        href: s.slug ? `/${s.slug}` : "",
        ...(s.description ? { description: s.description } : {}),
      }))
      .filter((s) => s.href);
    if (services.length) data.services = services;
  }

  const associated = (doc.associatedDepartments ?? []).map((g) => ({
    ...(g.category ? { category: g.category } : {}),
    items: (g.items ?? []).map((i) =>
      i.slug ? { name: i.name ?? "", slug: i.slug } : { name: i.name ?? "" },
    ),
  }));
  if (associated.length) data.associatedDepartments = associated;

  if (doc.originalSource) data.originalSource = doc.originalSource;

  return { data, body: doc.body ?? EMPTY_EDITOR_STATE };
}
