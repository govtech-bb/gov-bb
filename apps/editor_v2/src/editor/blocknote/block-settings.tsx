/**
 * What a block has to say for itself beyond its text.
 *
 * Going Notion-like moved the prose into the document and took the old
 * per-block forms with it — which also took away the settings that are not
 * text: a heading's anchor, a notice's variant, and every configuration
 * block's entire contents. This is where they come back.
 *
 * Text is deliberately absent. A paragraph's words are edited by typing at
 * them; only the things you cannot type are here.
 */

import type { Block, CollectionDefinition } from "@govtech-bb/block-kit";
import {
  CalendarEditor,
  ContactEditor,
  DataTableEditor,
  FinderEditor,
} from "../blocks/config";
import { ImagePlaceholderEditor, StartLinkEditor } from "../blocks/prose";
import { SelectField, TextField } from "../fields";

export function blockHasSettings(block: Block): boolean {
  return block.type !== "paragraph" && block.type !== "list";
}

export function BlockSettings({
  block,
  onChange,
  collections,
  refKeys,
}: {
  block: Block;
  onChange: (next: Block) => void;
  collections: CollectionDefinition[];
  refKeys: string[];
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="ed-stack">
          <SelectField
            label="Level"
            value={String(block.level)}
            options={[
              { value: "2", label: "Heading 2" },
              { value: "3", label: "Heading 3" },
            ]}
            onChange={(value) =>
              onChange({ ...block, level: Number(value) as 2 | 3 })
            }
          />
          <TextField
            label="Anchor"
            hint="The URL fragment people link to. Changing it breaks existing links."
            value={block.anchor}
            testId={`anchor-${block.id}`}
            onChange={(anchor) => onChange({ ...block, anchor })}
          />
        </div>
      );

    case "notice":
      return (
        <SelectField
          label="Variant"
          value={block.variant}
          options={[
            { value: "info", label: "Information" },
            { value: "warning", label: "Warning" },
          ]}
          onChange={(variant) => onChange({ ...block, variant })}
        />
      );

    case "start_link":
      return <StartLinkEditor block={block} onChange={onChange} />;

    case "image_placeholder":
      return <ImagePlaceholderEditor block={block} onChange={onChange} />;

    case "finder":
      return (
        <FinderEditor
          block={block}
          onChange={onChange}
          collections={collections}
        />
      );

    case "calendar":
      return (
        <CalendarEditor
          block={block}
          onChange={onChange}
          collections={collections}
        />
      );

    case "data_table":
      return (
        <DataTableEditor
          block={block}
          onChange={onChange}
          collections={collections}
          refKeys={refKeys}
        />
      );

    case "contact":
      return (
        <ContactEditor
          block={block}
          onChange={onChange}
          collections={collections}
        />
      );

    default:
      return (
        <p className="ed-hint">
          This block has no settings — edit it by typing in the document.
        </p>
      );
  }
}
