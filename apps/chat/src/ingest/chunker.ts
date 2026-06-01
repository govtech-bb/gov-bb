// Embed text is phrased as a question ("who is the minister of X?") to match
// how users type queries — this lifts retrieval scores more than reranking does.

import { createHash } from "node:crypto";
import type { ServiceEntity } from "@govtech-bb/content";
import type { ChunkKind, DocumentKind } from "#/lib/db/schema";

const HEADING_RE = /^(#{2,6})\s+(.+)$/gm;

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

function sectionSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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

interface Section {
  heading?: string;
  headingPath: string[];
  text: string;
}

function splitSections(body: string): Section[] {
  const matches = Array.from(body.matchAll(HEADING_RE));
  if (matches.length === 0) {
    return body.trim() ? [{ headingPath: [], text: body.trim() }] : [];
  }
  const sections: Section[] = [];
  const preamble = body.slice(0, matches[0].index!).trim();
  if (preamble) {
    sections.push({
      heading: "Summary",
      headingPath: ["Summary"],
      text: preamble,
    });
  }
  const stack: Array<{ level: number; text: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const level = m[1].length;
    const heading = m[2].trim();
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, text: heading });
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    const text = body.slice(start, end).trim();
    if (text) {
      sections.push({
        heading,
        headingPath: stack.map((s) => s.text),
        text,
      });
    }
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
    const breadcrumb = [entity.title, ...s.headingPath].join(" > ");
    const text = s.headingPath.length ? `${breadcrumb}\n${s.text}` : s.text;
    const slugParts = s.headingPath.length
      ? s.headingPath.map(sectionSlug).filter(Boolean)
      : [`default-${i}`];
    // chunkIndex disambiguates duplicate heading paths within the same doc
    // (e.g. two sections both titled "Standard"). Without it the second
    // section's chunk id collides with the first and upsert silently drops
    // content.
    const slug = `${slugParts.join("/")}#${i}`;
    return {
      id: `${docId}:section:${slug}`,
      documentId: docId,
      kind: "section" as const,
      chunkIndex: i,
      text,
      payload: { heading: s.heading, headingPath: s.headingPath },
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
