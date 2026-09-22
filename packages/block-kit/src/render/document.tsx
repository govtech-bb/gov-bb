import type { Block, PageDocument } from "../types";
import { CalendarIsland } from "./calendar";
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
      <h1 className="bk-title">{doc.title}</h1>
      {doc.description ? (
        <p className="bk-description">{doc.description}</p>
      ) : null}
      {doc.body.blocks.map((block) => (
        <RenderBlock key={block.id} block={block} ctx={ctx} />
      ))}
    </article>
  );
}
