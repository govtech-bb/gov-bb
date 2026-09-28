/**
 * The nine validation rules, run before every save.
 *
 * Pure: it takes the collection definitions and the set of known page URLs
 * as arguments, so it never touches the database and can run in the editor,
 * in a test, or (later) server-side behind an API.
 *
 * Rules 5 to 7 are the whole defence for `body.blocks[].collection` pointing
 * at `data_collections.key` — Postgres cannot put a foreign key inside JSONB.
 */

import { bodySchema } from "./schema";
import type {
  Block,
  CollectionDefinition,
  PageDocument,
  Ref,
  Span,
} from "./types";

export interface ValidationError {
  /** Null for document-level errors that belong to no single block. */
  blockId: string | null;
  rule: number;
  message: string;
}

export interface ValidationContext {
  collections: CollectionDefinition[];
  /** Every `url` in `content_pages`, for rule 8. */
  pageUrls: string[];
}

const fieldKeys = (collection: CollectionDefinition): Set<string> =>
  new Set(collection.schema.fields.map((f) => f.key));

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Every span in a block, whatever shape the block holds them in. */
function spansOf(block: Block): Span[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "notice":
      return block.content;
    case "list":
      return block.items.flatMap((item) => item.content);
    // A contact block's description is author-written prose, so its spans
    // have to be reachable — otherwise a link inside it escapes rule 4 and
    // the href allowlist that rule 1 applies.
    case "contact":
      return block.description;
    default:
      return [];
  }
}

/** Ref keys a block itself uses, outside its spans. */
function blockRefKeys(block: Block): string[] {
  return block.type === "data_table" ? [block.source] : [];
}

export function validateDocument(
  doc: PageDocument,
  ctx: ValidationContext,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const byKey = new Map(ctx.collections.map((c) => [c.key, c]));

  // Rule 1 — the body validates against the Zod schema.
  const parsed = bodySchema.safeParse(doc.body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      // issue.path is like ['blocks', 3, 'facets', 0, 'key'] — recover the
      // block id so the editor can point at the block that failed.
      const index = typeof issue.path[1] === "number" ? issue.path[1] : null;
      const block = index === null ? undefined : doc.body.blocks[index];
      errors.push({
        blockId: block?.id ?? null,
        rule: 1,
        message: `${issue.path.join(".")}: ${issue.message}`,
      });
    }
    // Everything below assumes the parsed shape; stop here.
    return errors;
  }

  // Rule 2 — the url starts with '/'. Uniqueness is the column's job.
  if (!doc.url.startsWith("/")) {
    errors.push({
      blockId: null,
      rule: 2,
      message: `url must start with "/" (got "${doc.url}")`,
    });
  }

  // Rule 3 — every block id is unique within the document. List item ids
  // share the namespace: they are anchors too.
  const seenIds = new Set<string>();
  const noteId = (id: string, owner: string) => {
    if (seenIds.has(id)) {
      errors.push({
        blockId: owner,
        rule: 3,
        message: `duplicate block id "${id}"`,
      });
    }
    seenIds.add(id);
  };
  for (const block of doc.body.blocks) {
    noteId(block.id, block.id);
    if (block.type === "list") {
      for (const item of block.items) noteId(item.id, block.id);
    }
  }

  // Rule 4 — every ref key used resolves in body.refs.
  const refs: Record<string, Ref> = doc.body.refs;
  for (const block of doc.body.blocks) {
    const used = [
      ...spansOf(block)
        .map((s) => s.ref)
        .filter((r): r is string => typeof r === "string"),
      ...blockRefKeys(block),
    ];
    for (const key of used) {
      if (!(key in refs)) {
        errors.push({
          blockId: block.id,
          rule: 4,
          message: `ref "${key}" is not defined in body.refs`,
        });
      }
    }
  }

  // Rule 9 — heading anchors are unique within the document.
  const seenAnchors = new Set<string>();
  for (const block of doc.body.blocks) {
    if (block.type !== "heading") continue;
    if (seenAnchors.has(block.anchor)) {
      errors.push({
        blockId: block.id,
        rule: 9,
        message: `duplicate heading anchor "${block.anchor}"`,
      });
    }
    seenAnchors.add(block.anchor);
  }

  for (const block of doc.body.blocks) {
    // Rule 5 — a finder or calendar block names a collection that exists.
    if (block.type === "finder" || block.type === "calendar") {
      const collection = byKey.get(block.collection);
      if (!collection) {
        errors.push({
          blockId: block.id,
          rule: 5,
          message: `collection "${block.collection}" is not in data_collections`,
        });
        continue;
      }
      const fields = fieldKeys(collection);

      if (block.type === "finder") {
        // Rule 6 — a facet key is a field, or names the field(s) it is
        // computed from.
        for (const facet of block.facets) {
          const computed = asArray(facet.computed_from);
          if (computed.length > 0) {
            for (const source of computed) {
              if (!fields.has(source)) {
                errors.push({
                  blockId: block.id,
                  rule: 6,
                  message: `facet "${facet.key}" is computed_from "${source}", which is not a field of "${collection.key}"`,
                });
              }
            }
          } else if (!fields.has(facet.key)) {
            errors.push({
              blockId: block.id,
              rule: 6,
              message: `facet "${facet.key}" is neither a field of "${collection.key}" nor computed_from one`,
            });
          }

          // A facet drawing its options from another collection needs that
          // collection to exist too.
          if (
            facet.allowed_values_from &&
            !byKey.has(facet.allowed_values_from)
          ) {
            errors.push({
              blockId: block.id,
              rule: 5,
              message: `facet "${facet.key}" draws values from collection "${facet.allowed_values_from}", which is not in data_collections`,
            });
          }
        }

        // Rule 7 — every result_template.metadata entry is a field.
        for (const key of block.result_template.metadata) {
          // Metadata may name a computed facet rather than a raw field.
          const computedFacet = block.facets.some((f) => f.key === key);
          if (!fields.has(key) && !computedFacet) {
            errors.push({
              blockId: block.id,
              rule: 7,
              message: `result metadata "${key}" is not a field of "${collection.key}" nor a facet on this block`,
            });
          }
        }

        for (const key of block.search.fields) {
          if (!fields.has(key)) {
            errors.push({
              blockId: block.id,
              rule: 7,
              message: `search field "${key}" is not a field of "${collection.key}"`,
            });
          }
        }
      }

      if (block.type === "calendar") {
        for (const column of block.columns) {
          // `date` and `day` are computed from the rule, never stored on
          // the row, so neither is a field of the collection.
          const computed = column.field === "date" || column.field === "day";
          if (!computed && !fields.has(column.field)) {
            errors.push({
              blockId: block.id,
              rule: 7,
              message: `calendar column "${column.field}" is not a field of "${collection.key}"`,
            });
          }
        }
      }
    }

    // Rule 7 — a data_table's columns are fields of the collection its
    // source ref points at.
    if (block.type === "data_table") {
      const ref = refs[block.source];
      if (ref && (ref.kind === "query" || ref.kind === "record")) {
        const collection = byKey.get(ref.collection);
        if (!collection) {
          errors.push({
            blockId: block.id,
            rule: 5,
            message: `ref "${block.source}" names collection "${ref.collection}", which is not in data_collections`,
          });
        } else {
          const fields = fieldKeys(collection);
          for (const column of block.columns) {
            if (!fields.has(column.field)) {
              errors.push({
                blockId: block.id,
                rule: 7,
                message: `column "${column.field}" is not a field of "${collection.key}"`,
              });
            }
          }
        }
      } else if (ref) {
        errors.push({
          blockId: block.id,
          rule: 7,
          message: `data_table source "${block.source}" must be a record or query ref, not "${ref.kind}"`,
        });
      }
    }

    // Rules 5 and 7 for the contact block: the collection exists, and every
    // detail it shows is a field of it.
    if (block.type === "contact") {
      const collection = byKey.get(block.collection);
      if (!collection) {
        errors.push({
          blockId: block.id,
          rule: 5,
          message: `collection "${block.collection}" is not in data_collections`,
        });
      } else {
        const fields = fieldKeys(collection);
        for (const field of block.fields) {
          if (!fields.has(field.field)) {
            errors.push({
              blockId: block.id,
              rule: 7,
              message: `field "${field.field}" is not a field of "${collection.key}"`,
            });
          }
        }
      }
    }

    // Rule 8 — an internal start_link points at a page that exists.
    if (block.type === "start_link" && block.target_kind === "page") {
      if (!ctx.pageUrls.includes(block.target)) {
        errors.push({
          blockId: block.id,
          rule: 8,
          message: `start_link targets "${block.target}", which is not a url in content_pages`,
        });
      }
    }
  }

  return errors;
}

/** Errors grouped by block id, for rendering next to the failing block. */
export function errorsByBlock(
  errors: ValidationError[],
): Map<string | null, ValidationError[]> {
  const grouped = new Map<string | null, ValidationError[]>();
  for (const error of errors) {
    const existing = grouped.get(error.blockId);
    if (existing) existing.push(error);
    else grouped.set(error.blockId, [error]);
  }
  return grouped;
}
