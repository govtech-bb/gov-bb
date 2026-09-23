/**
 * The BlockNote schema — and the closed palette, enforced structurally.
 *
 * §3.6 of the brief says the insert menu *is* the content model made
 * visible. Filtering the slash menu would only hide the other block types;
 * naming the specs explicitly means BlockNote cannot represent a table, a
 * code block, a checklist or a file at all. A paste that would produce one
 * has nowhere to land, which is a much stronger guarantee than a menu.
 *
 * Only `paragraph`, `heading` and the two list items come from BlockNote.
 * Everything else is ours.
 */

import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import type { Block, NoticeBlock } from "@govtech-bb/block-kit";
import { ConfigBlockShell } from "./config-block";

/** Configuration travels as JSON in one prop — see the adapter's note. */
const configProps = { config: { default: "{}" } } as const;

/**
 * In BlockNote 0.54 `createReactBlockSpec` returns a factory, not a spec,
 * so each of these is called when the schema is built.
 */
function configSpec(type: string) {
  return createReactBlockSpec(
    { type, content: "none", propSchema: configProps },
    {
      // Read-only in the document: the block renders its output, and its
      // settings are edited in the popover the block menu opens.
      render: ({ block }) => {
        const value = {
          id: block.id,
          ...(JSON.parse(String(block.props.config) || "{}") as object),
        } as Block;
        return <ConfigBlockShell block={value} />;
      },
    },
  );
}

/**
 * The notice keeps editable text, so it is the one non-prose block that is
 * still typed into directly. `contentRef` is where BlockNote puts that text.
 */
const noticeSpec = createReactBlockSpec(
  {
    type: "notice",
    content: "inline",
    propSchema: { variant: { default: "info", values: ["info", "warning"] } },
  },
  {
    render: ({ block, contentRef }) => {
      const variant = String(block.props.variant) as NoticeBlock["variant"];
      return (
        <aside
          className={`bk-notice bk-notice-${variant}`}
          data-block-type="notice"
        >
          <div className="bk-notice-body" ref={contentRef} />
        </aside>
      );
    },
  },
);

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    notice: noticeSpec(),
    start_link: configSpec("start_link")(),
    finder: configSpec("finder")(),
    calendar: configSpec("calendar")(),
    data_table: configSpec("data_table")(),
    contact: configSpec("contact")(),
    image_placeholder: configSpec("image_placeholder")(),
  },
});

export type EditorSchema = typeof editorSchema;
