/**
 * Contact details for one organisation.
 *
 * The split is the point of the block. The heading and the description are
 * the author's — they say when to get in touch and what about, which differs
 * per page. The details underneath are the ministry's, read from a record, so
 * a phone number changed once is correct on every page that shows it.
 *
 * Rendered as a description list rather than as paragraphs: "Telephone" and
 * the number are a label and its value, and a `dl` is the markup that says so.
 * The four paragraphs this replaces said nothing about which line was a
 * label, which is part of why the postal address underneath them read as a
 * loose list.
 */

import type { ContactBlock } from "../types";
import { hrefAttr } from "../href";
import { Spans, type RenderContext } from "./spans";

/**
 * A detail that is really a link. Phone numbers and email addresses are
 * actionable on a phone, and a citizen reading this on one should be able to
 * tap rather than transcribe.
 *
 * Derived from the field name rather than stored, because the alternative is
 * asking an author to declare that `phone` is a telephone number — which they
 * would get wrong exactly as often as the naming convention would.
 */
function linkFor(field: string, value: string): string | null {
  if (field.includes("phone") || field.includes("telephone")) {
    return `tel:${value.replace(/[^\d+]/g, "")}`;
  }
  if (field.includes("email")) return `mailto:${value}`;
  if (field.includes("website") || field.includes("url")) {
    return value.startsWith("http") ? value : `https://${value}`;
  }
  return null;
}

export function Contact({
  block,
  ctx,
}: {
  block: ContactBlock;
  ctx: RenderContext;
}) {
  const rows = ctx.data[block.collection] ?? [];
  const record = rows.find(
    (row) => String(row.key ?? row.slug ?? "") === block.record,
  );

  return (
    <section className="bk-contact" aria-label={block.title}>
      <h2 className="bk-contact-title">{block.title}</h2>

      {block.description.length > 0 ? (
        <p className="bk-contact-lede">
          <Spans content={block.description} ctx={ctx} />
        </p>
      ) : null}

      {ctx.loading ? (
        <p className="bk-empty">Loading…</p>
      ) : !record ? (
        /*
         * Said plainly rather than rendered as an empty shell. A contact
         * block whose record has been deleted is a page telling a citizen to
         * get in touch and then showing them nothing — better to be visibly
         * broken to whoever is looking at it.
         */
        <p className="bk-empty">
          No contact record “{block.record}” in {block.collection}.
        </p>
      ) : (
        <dl className="bk-contact-details">
          {block.fields.map(({ field, label }) => {
            const value = record[field];
            if (value === undefined || value === null || value === "") {
              return null;
            }
            const text = String(value);
            const href = linkFor(field, text);
            return (
              <div className="bk-contact-row" key={field}>
                <dt>{label}</dt>
                <dd>
                  {href ? <a {...hrefAttr(href)}>{text}</a> : text}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
