import type { ReactNode } from "react";
import { safeHref } from "../href";
import type { Ref, Span } from "../types";

export interface RenderContext {
  /** Collection records, keyed by collection key. */
  data: Record<string, Array<Record<string, unknown>>>;
  refs: Record<string, Ref>;
  /** True while the collections this page reads are still arriving. */
  loading?: boolean;
  /** Turns a start_link target into an href. */
  resolveHref?: (kind: "form" | "page" | "external", target: string) => string;
}

/**
 * Resolve a value-reference span: `{ ref, field }` with no text. None of the
 * three seeded pages uses one — it is handled here so the shape is fixed and
 * the renderer does not have to change when references arrive.
 */
function resolveSpanValue(span: Span, ctx: RenderContext): string {
  if (!span.ref) return "";
  const ref = ctx.refs[span.ref];
  if (!ref || ref.kind !== "record") return "";
  const record = (ctx.data[ref.collection] ?? []).find(
    (row) => row.slug === ref.record || row.key === ref.record,
  );
  const value = span.field ? record?.[span.field] : undefined;
  return value == null ? "" : String(value);
}

/**
 * The href a span links to, or null when it is not a link.
 *
 * A span with BOTH text and a ref is linked text; a span with a ref and no
 * text is a value reference. That is the whole distinction, and it is why
 * the model needs no separate "link" mark.
 */
function resolveSpanHref(span: Span, ctx: RenderContext): string | null {
  if (!span.ref || span.text === undefined) return null;
  const ref = ctx.refs[span.ref];
  if (!ref) return null;
  // Through safeHref last, so a host's resolveHref cannot widen what a
  // document is allowed to emit either.
  if (ref.kind === "external") {
    return safeHref(ctx.resolveHref?.("external", ref.href) ?? ref.href);
  }
  if (ref.kind === "page") {
    return safeHref(ctx.resolveHref?.("page", ref.url) ?? ref.url);
  }
  return null;
}

function markUp(
  text: string,
  span: Span,
  key: number,
  ctx: RenderContext,
): ReactNode {
  let node: ReactNode = text;
  // Applied outermost-last so <strong><em> nests predictably.
  for (const mark of span.marks ?? []) {
    if (mark === "strong") node = <strong>{node}</strong>;
    else if (mark === "em") node = <em>{node}</em>;
    else if (mark === "code") node = <code>{node}</code>;
  }

  const href = resolveSpanHref(span, ctx);
  if (href) {
    const external = href.startsWith("http");
    node = (
      <a
        className="bk-link"
        href={href}
        {...(external ? { rel: "noreferrer noopener" } : {})}
      >
        {node}
      </a>
    );
  }

  return <span key={key}>{node}</span>;
}

export function Spans({
  content,
  ctx,
}: {
  content: Span[];
  ctx: RenderContext;
}) {
  return (
    <>
      {content.map((span, index) =>
        markUp(span.text ?? resolveSpanValue(span, ctx), span, index, ctx),
      )}
    </>
  );
}

/** The plain-text projection of a run of spans — used for anchors and alt text. */
export function spansToText(content: Span[]): string {
  return content.map((span) => span.text ?? "").join("");
}

/** A URL fragment derived from heading text, generated once at creation. */
export function anchorFromText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
