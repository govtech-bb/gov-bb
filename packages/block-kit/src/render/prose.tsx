import type {
  HeadingBlock,
  ImagePlaceholderBlock,
  ListBlock,
  NoticeBlock,
  ParagraphBlock,
  StartLinkBlock,
} from "../types";
import { Spans, type RenderContext } from "./spans";
import { safeHref } from "../href";

export function Paragraph({
  block,
  ctx,
}: {
  block: ParagraphBlock;
  ctx: RenderContext;
}) {
  return (
    <p className="bk-paragraph">
      <Spans content={block.content} ctx={ctx} />
    </p>
  );
}

export function Heading({
  block,
  ctx,
}: {
  block: HeadingBlock;
  ctx: RenderContext;
}) {
  // The anchor is a URL fragment, so it is rendered from the stored value
  // and never re-derived from the text at render time.
  const Tag = block.level === 2 ? "h2" : "h3";
  return (
    <Tag id={block.anchor} className={`bk-heading bk-h${block.level}`}>
      <Spans content={block.content} ctx={ctx} />
    </Tag>
  );
}

export function List({ block, ctx }: { block: ListBlock; ctx: RenderContext }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag className={`bk-list ${block.ordered ? "bk-list-ordered" : ""}`}>
      {block.items.map((item) => (
        <li key={item.id}>
          <Spans content={item.content} ctx={ctx} />
        </li>
      ))}
    </Tag>
  );
}

export function Notice({
  block,
  ctx,
}: {
  block: NoticeBlock;
  ctx: RenderContext;
}) {
  return (
    <div className={`bk-notice bk-notice-${block.variant}`} role="note">
      <Spans content={block.content} ctx={ctx} />
    </div>
  );
}

export function StartLink({
  block,
  ctx,
}: {
  block: StartLinkBlock;
  ctx: RenderContext;
}) {
  // An unsafe target renders the button with no href at all rather than a
  // working `javascript:` link. It is inert and obviously broken, which is
  // the right failure for something a citizen is invited to click.
  const href = safeHref(
    ctx.resolveHref?.(block.target_kind, block.target) ?? block.target,
  );
  return (
    <p className="bk-start">
      <a
        className="bk-start-button"
        {...(href ? { href } : {})}
        data-kind={block.target_kind}
      >
        {block.label}
        <svg
          className="bk-start-arrow"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M5 12h12m0 0-5-5m5 5-5 5"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </p>
  );
}

export function ImagePlaceholder({ block }: { block: ImagePlaceholderBlock }) {
  // No upload in this spike; the block exists so the palette contains one
  // block with no content model at all.
  return (
    <figure className="bk-image-placeholder">
      <div className="bk-image-box" role="img" aria-label={block.alt}>
        <span>Image</span>
      </div>
      {block.caption ? <figcaption>{block.caption}</figcaption> : null}
    </figure>
  );
}
