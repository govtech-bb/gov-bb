import type { Block, PageDocument } from "../types";
import { CalendarIsland } from "./calendar";
import { Contact } from "./contact";
import { DataTable } from "./data-table";
import { FinderIsland } from "./finder";
import {
  Heading,
  ImagePlaceholder,
  List,
  Notice,
  Paragraph,
  StartLink,
} from "./prose";
import type { RenderContext } from "./spans";
import { Heading as DsHeading, Text } from "@govtech-bb/react";

/**
 * One renderer, used by the editor's preview pane and by the site. If these
 * ever diverge the spike stops answering its own question.
 */
export function RenderBlock({
  block,
  ctx,
}: {
  block: Block;
  ctx: RenderContext;
}) {
  switch (block.type) {
    case "paragraph":
      return <Paragraph block={block} ctx={ctx} />;
    case "heading":
      return <Heading block={block} ctx={ctx} />;
    case "list":
      return <List block={block} ctx={ctx} />;
    case "notice":
      return <Notice block={block} ctx={ctx} />;
    case "start_link":
      return <StartLink block={block} ctx={ctx} />;
    case "image_placeholder":
      return <ImagePlaceholder block={block} />;
    case "data_table":
      return <DataTable block={block} ctx={ctx} />;
    case "contact":
      return <Contact block={block} ctx={ctx} />;
    case "finder":
      return <FinderIsland block={block} ctx={ctx} />;
    case "calendar":
      return <CalendarIsland block={block} ctx={ctx} />;
  }
}

export function RenderDocument({
  doc,
  data,
  loading,
  resolveHref,
}: {
  doc: PageDocument;
  data: RenderContext["data"];
  loading?: boolean;
  resolveHref?: RenderContext["resolveHref"];
}) {
  const ctx: RenderContext = {
    data,
    refs: doc.body.refs,
    loading,
    resolveHref,
  };
  return (
    <article className="bk-document">
      <DsHeading as="h1" className="bk-title">
        {doc.title}
      </DsHeading>
      {doc.description ? (
        <Text as="p" className="bk-description">
          {doc.description}
        </Text>
      ) : null}
      {/*
        Every content page on the live site says when it was last changed.
        It comes from `updated_at` rather than a field an author maintains,
        so it cannot drift from the truth — the cost being that it moves
        on any save, including one that changed nothing a reader sees.
      */}
      <p className="bk-updated">
        Last updated on {formatUpdated(doc.updated_at)}
      </p>
      {doc.body.blocks.map((block) => (
        <RenderBlock key={block.id} block={block} ctx={ctx} />
      ))}
    </article>
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "September 2nd, 2026" — the format the live content pages use. */
export function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getDate();
  const rest = day % 100;
  const suffix =
    rest >= 11 && rest <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${MONTHS[date.getMonth()]} ${day}${suffix}, ${date.getFullYear()}`;
}
