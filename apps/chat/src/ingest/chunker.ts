// Deterministic chunker. Turns content entities into embed-ready chunks.
// Each chunk has a stable id and a hash of its embed text.
//
// Embed-text templates are *question-phrased* on purpose: end users type
// "who is the minister of X?" / "phone number for Y", not "Minister: X".
// Matching the user phrasing in the embedding text moves retrieval scores
// far more than any reranker or threshold tweak.

import { createHash } from "node:crypto";
import type { Contact, MdaEntity, ServiceEntity } from "@govtech-bb/content";
import type { ChunkKind, DocumentKind } from "#/lib/db/schema";

const HEADING_RE = /^##\s+(.+)$/gm;
const CHUNK_TARGET = 2000;
const CHUNK_OVERLAP = 200;

export interface PlannedDocument {
  id: string;
  kind: DocumentKind;
  slug: string;
  title: string;
  url: string;
  sourceUrl?: string;
  metadata: Record<string, unknown>;
  payloadHash: string;
}

export interface PlannedChunk {
  id: string;
  documentId: string;
  kind: ChunkKind;
  chunkIndex: number;
  text: string;
  payload?: Record<string, unknown>;
  embedHash: string;
}

export interface PlannedEntity {
  document: PlannedDocument;
  chunks: PlannedChunk[];
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function flattenValue(value: Contact["value"]): string {
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

function chunkBody(text: string): string[] {
  if (text.length <= CHUNK_TARGET) return [text];
  const paras = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf.length + p.length + 2 <= CHUNK_TARGET) {
      buf = buf ? `${buf}\n\n${p}` : p;
      continue;
    }
    if (buf) chunks.push(buf);
    if (p.length <= CHUNK_TARGET) {
      buf = p;
    } else {
      for (let i = 0; i < p.length; i += CHUNK_TARGET - CHUNK_OVERLAP) {
        chunks.push(p.slice(i, i + CHUNK_TARGET));
      }
      buf = "";
    }
  }
  if (buf) chunks.push(buf);
  for (let i = 1; i < chunks.length; i++) {
    chunks[i] = `${chunks[i - 1].slice(-CHUNK_OVERLAP)}\n${chunks[i]}`;
  }
  return chunks;
}

function sectionSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// MDA chunker
// ---------------------------------------------------------------------------

const ORG_URL_PREFIX = "https://alpha.gov.bb/government/organisations";

function mdaDocId(entity: MdaEntity): string {
  return `${entity.kind}-${entity.slug}`;
}

function mdaTitleDisplay(entity: MdaEntity): string {
  return entity.name;
}

function nameChunk(entity: MdaEntity, docId: string): PlannedChunk | null {
  const aliases = entity.keywords.filter((k) => k !== entity.name);
  const parts: string[] = [entity.name];
  if (aliases.length) parts.push(`Also known as: ${aliases.join(", ")}.`);
  if (entity.shortDescription) parts.push(entity.shortDescription);
  if (entity.intro) parts.push(entity.intro);
  const text = parts.join(" ");
  return {
    id: `${docId}:name:0`,
    documentId: docId,
    kind: "name",
    chunkIndex: 0,
    text,
    payload: { aliases },
    embedHash: hash(text),
  };
}

// Pick the most useful "short alias" — typically an acronym like "BRA",
// "MIST", "FTC". Heuristic: a keyword that looks like an acronym (mostly
// uppercase, 2-8 chars, no spaces). Front-loading this in the embed text
// helps queries phrased with the acronym ("BRA phone number") match the
// right entity.
function primaryAlias(entity: MdaEntity): string | null {
  for (const k of entity.keywords) {
    if (k.length < 2 || k.length > 8) continue;
    if (/\s/.test(k)) continue;
    if (k === k.toUpperCase()) return k;
  }
  return null;
}

function nameTagline(entity: MdaEntity): string {
  const alias = primaryAlias(entity);
  return alias ? `${entity.name} (${alias})` : entity.name;
}

function ministerChunk(entity: MdaEntity, docId: string): PlannedChunk | null {
  const m = entity.minister ?? entity.head;
  if (!m) return null;
  const kind: ChunkKind = entity.minister ? "minister" : "head";
  const titleNoun = entity.minister ? "minister" : "head";
  const tag = nameTagline(entity);
  const text = [
    `Who is the ${titleNoun} of ${tag}?`,
    m.role ? `${m.role}: ${m.name}.` : `${m.name}.`,
  ].join(" ");
  return {
    id: `${docId}:${kind}:0`,
    documentId: docId,
    kind,
    chunkIndex: 0,
    text,
    payload: { name: m.name, role: m.role },
    embedHash: hash(text),
  };
}

const CONTACT_QUESTION: Record<
  NonNullable<Contact["type"]> | "default",
  string
> = {
  phone: "Phone number for",
  email: "Email address for",
  website: "Website for",
  address: "Address of",
  text: "Contact details for",
  default: "Contact details for",
};

function contactChunks(entity: MdaEntity, docId: string): PlannedChunk[] {
  const out: PlannedChunk[] = [];
  let idx = 0;
  const tag = nameTagline(entity);
  for (const c of entity.contact) {
    const value = flattenValue(c.value);
    if (!value) continue;
    const lead =
      CONTACT_QUESTION[c.type ?? "default"] ?? CONTACT_QUESTION.default;
    const label = c.label ?? c.type ?? "Contact";
    const text = `${lead} ${tag}: ${value}. (${label})`;
    out.push({
      id: `${docId}:contact:${idx}`,
      documentId: docId,
      kind: "contact",
      chunkIndex: idx,
      text,
      payload: { type: c.type, label, value },
      embedHash: hash(text),
    });
    idx++;
  }
  return out;
}

function bodyChunks(
  entity: MdaEntity | ServiceEntity,
  docId: string,
): PlannedChunk[] {
  if (!entity.body) return [];
  const parts = chunkBody(entity.body);
  return parts.map((text, i) => ({
    id: `${docId}:body:${i}`,
    documentId: docId,
    kind: "body" as const,
    chunkIndex: i,
    text,
    embedHash: hash(text),
  }));
}

export function chunkMda(entity: MdaEntity): PlannedEntity {
  const docId = mdaDocId(entity);
  const title = mdaTitleDisplay(entity);
  const url = `${ORG_URL_PREFIX}/${entity.slug}`;

  const chunks: PlannedChunk[] = [];
  const name = nameChunk(entity, docId);
  if (name) chunks.push(name);
  const minister = ministerChunk(entity, docId);
  if (minister) chunks.push(minister);
  chunks.push(...contactChunks(entity, docId));
  chunks.push(...bodyChunks(entity, docId));

  const metadata: Record<string, unknown> = {
    category: entity.category,
    keywords: entity.keywords,
    originalSource: entity.originalSource,
    onlineServicesCount: entity.onlineServices.length,
  };

  const payloadHash = hash(
    JSON.stringify({
      title,
      url,
      metadata,
      sourceUrl: entity.originalSource,
    }),
  );

  return {
    document: {
      id: docId,
      kind: entity.kind,
      slug: entity.slug,
      title,
      url,
      sourceUrl: entity.originalSource,
      metadata,
      payloadHash,
    },
    chunks,
  };
}

// ---------------------------------------------------------------------------
// Service chunker
// ---------------------------------------------------------------------------

function deriveServiceUrl(entity: ServiceEntity): {
  url: string;
  sourceUrl?: string;
} {
  if (entity.source_url) {
    const isAlpha = entity.source_url.includes("alpha.gov.bb");
    return isAlpha
      ? { url: entity.source_url }
      : {
          url: `https://alpha.gov.bb/${entity.slug}`,
          sourceUrl: entity.source_url,
        };
  }
  return { url: `https://alpha.gov.bb/${entity.slug}` };
}

function splitSections(
  body: string,
): Array<{ heading?: string; text: string }> {
  const matches = Array.from(body.matchAll(HEADING_RE));
  if (matches.length === 0) {
    return body.trim() ? [{ text: body.trim() }] : [];
  }
  const sections: Array<{ heading?: string; text: string }> = [];
  const preamble = body.slice(0, matches[0].index!).trim();
  if (preamble) sections.push({ heading: "Summary", text: preamble });
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    const text = body.slice(start, end).trim();
    if (text) sections.push({ heading: m[1].trim(), text });
  }
  return sections;
}

function intentChunk(entity: ServiceEntity, docId: string): PlannedChunk {
  const titleLower = entity.title.toLowerCase();
  const lines = [`How do I ${titleLower}?`, `${entity.title}.`];
  if (entity.description) lines.push(entity.description);
  const text = lines.join(" ");
  return {
    id: `${docId}:intent:0`,
    documentId: docId,
    kind: "intent",
    chunkIndex: 0,
    text,
    payload: { description: entity.description },
    embedHash: hash(text),
  };
}

function sectionChunks(entity: ServiceEntity, docId: string): PlannedChunk[] {
  const sections = splitSections(entity.body);
  if (sections.length === 0) return [];
  return sections.map((s, i) => {
    const text = s.heading
      ? `${entity.title} — ${s.heading}\n${s.text}`
      : s.text;
    const slug = s.heading ? sectionSlug(s.heading) : `default-${i}`;
    return {
      id: `${docId}:section:${slug}`,
      documentId: docId,
      kind: "section" as const,
      chunkIndex: i,
      text,
      payload: { heading: s.heading },
      embedHash: hash(text),
    };
  });
}

export function chunkService(entity: ServiceEntity): PlannedEntity {
  const docId = `service-${entity.slug}`;
  const { url, sourceUrl } = deriveServiceUrl(entity);
  const chunks: PlannedChunk[] = [
    intentChunk(entity, docId),
    ...sectionChunks(entity, docId),
  ];

  const metadata: Record<string, unknown> = {
    description: entity.description,
    category: entity.category,
    categories: entity.categories,
    subcategory: entity.subcategory,
    section: entity.section,
    serviceType: entity.service_type,
    stage: entity.stage,
  };

  const payloadHash = hash(
    JSON.stringify({ title: entity.title, url, sourceUrl, metadata }),
  );

  return {
    document: {
      id: docId,
      kind: "service",
      slug: entity.slug,
      title: entity.title,
      url,
      sourceUrl,
      metadata,
      payloadHash,
    },
    chunks,
  };
}
