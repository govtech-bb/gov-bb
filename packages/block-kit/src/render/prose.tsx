import type {
  HeadingBlock,
  ImagePlaceholderBlock,
  ListBlock,
  NoticeBlock,
  ParagraphBlock,
  StartLinkBlock,
} from "../types";
import { Heading as DsHeading, List as DsList, Text } from "@govtech-bb/react";
import { Spans, type RenderContext } from "./spans";
import { safeHref } from "../href";

export function Paragraph({
  block,
  ctx,
}: {
  block: ParagraphBlock;
  ctx: RenderContext;
}) {
  // The design system's Text, not a bare <p>: the site is meant to look
  // like the rest of alpha.gov.bb, and hand-rolled type is how it stops.
  return (
    <Text as="p" className="bk-paragraph">
      <Spans content={block.content} ctx={ctx} />
    </Text>
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
  return (
    <DsHeading
      as={block.level === 2 ? "h2" : "h3"}
      id={block.anchor}
      className="bk-heading"
    >
      <Spans content={block.content} ctx={ctx} />
    </DsHeading>
  );
}

export function List({ block, ctx }: { block: ListBlock; ctx: RenderContext }) {
  // `variant` both picks the marker and the element — "number" renders an
  // <ol>, everything else a <ul> — so there is no `as` to pass. The
  // hand-rolled list had no markers at all, which is the most visible way
  // the site stopped looking like the estate it belongs to.
  return (
    <DsList variant={block.ordered ? "number" : "bullet"} className="bk-list">
      {block.items.map((item) => (
        <li key={item.id}>
          <Spans content={item.content} ctx={ctx} />
        </li>
      ))}
    </DsList>
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
