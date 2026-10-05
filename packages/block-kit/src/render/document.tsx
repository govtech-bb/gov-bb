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
  // The bank holiday page is its own layout on the live site: a wider
  // column, the year switcher beside the title, the date unadorned and no
  // rule beneath it, and the prose after the calendar set as a quiet
  // "about this list" footnote rather than as body copy.
  const calendar = doc.schema_name === "calendar";

  return (
    <article
      className={calendar ? "bk-document bk-document-calendar" : "bk-document"}
    >
      {/*
        The live content page's header: the title, then the last-updated
        line on its rule. The description is the page's meta description
        there, not a lede, so it is not rendered into the body.
      */}
      <header className="bk-header">
        <DsHeading as="h1" className="bk-title">
          {doc.title}
        </DsHeading>
        {/*
          It comes from `updated_at` rather than a field an author maintains,
          so it cannot drift from the truth — the cost being that it moves
          on any save, including one that changed nothing a reader sees.
        */}
        <div className="bk-updated">
          <Text as="p" size={calendar ? "body" : "body-sm"}>
            Last updated on{" "}
            {calendar
              ? formatUpdatedPlain(doc.updated_at)
              : formatUpdated(doc.updated_at)}
          </Text>
        </div>
      </header>
      {runs(doc.body.blocks).map((run, index, all) =>
        run.island ? (
          <RenderBlock
            key={run.blocks[0]!.id}
            block={run.blocks[0]!}
            ctx={ctx}
          />
        ) : (
          /*
            The design system's prose rhythm spaces the blocks, as it does a
            markdown body on the live site. Only prose, though: its rules
            reach every descendant — list spacing, heading colour — and would
            restyle a calendar's rows and hero as if they were copy.
          */
          <div
            key={run.blocks[0]!.id}
            className={
              calendar && all.slice(0, index).some((prior) => prior.island)
                ? "govbb-prose bk-aside"
                : "govbb-prose"
            }
          >
            {run.blocks.map((block) => (
              <RenderBlock key={block.id} block={block} ctx={ctx} />
            ))}
          </div>
        ),
      )}
    </article>
  );
}

/** Blocks that are whole components of their own, not copy. */
const ISLANDS = new Set<Block["type"]>(["finder", "calendar"]);

/** Consecutive prose blocks grouped together; each island on its own. */
function runs(blocks: Block[]): Array<{ island: boolean; blocks: Block[] }> {
  const out: Array<{ island: boolean; blocks: Block[] }> = [];
  for (const block of blocks) {
    const island = ISLANDS.has(block.type);
    const last = out.at(-1);
    if (!island && last && !last.island) last.blocks.push(block);
    else out.push({ island, blocks: [block] });
  }
  return out;
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

/** "5 May 2026" — the bank holiday page's format. */
function formatUpdatedPlain(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

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
