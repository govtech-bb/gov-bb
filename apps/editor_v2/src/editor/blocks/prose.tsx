import { anchorFromText, spansToText } from "@govtech-bb/block-kit";
import type {
  HeadingBlock,
  ImagePlaceholderBlock,
  ListBlock,
  NoticeBlock,
  ParagraphBlock,
  StartLinkBlock,
} from "@govtech-bb/block-kit";
import { CheckField, SelectField, TextField } from "../fields";
import { newId } from "../new-block";
import { SpanEditor } from "../span-editor";
import { Button } from "@govtech-bb/react";

export function ParagraphEditor({
  block,
  onChange,
}: {
  block: ParagraphBlock;
  onChange: (block: ParagraphBlock) => void;
}) {
  return (
    <SpanEditor
      ariaLabel="Paragraph text"
      value={block.content}
      onChange={(content) => onChange({ ...block, content })}
    />
  );
}

export function HeadingEditor({
  block,
  onChange,
}: {
  block: HeadingBlock;
  onChange: (block: HeadingBlock) => void;
}) {
  return (
    <div className="ed-stack">
      <SpanEditor
        ariaLabel="Heading text"
        value={block.content}
        onChange={(content) =>
          onChange({
            ...block,
            content,
            // Generated from the text only while the anchor is still empty.
            // After that it is a URL fragment someone may have linked to,
            // and it must not silently change when the text is edited.
            anchor: block.anchor || anchorFromText(spansToText(content)),
          })
        }
      />
      <div className="ed-row">
        <SelectField
          label="Level"
          value={String(block.level) as "2" | "3"}
          options={[
            { value: "2", label: "Heading 2" },
            { value: "3", label: "Heading 3" },
          ]}
          onChange={(level) =>
            onChange({ ...block, level: Number(level) as 2 | 3 })
          }
        />
        <TextField
          label="Anchor"
          hint="A URL fragment. Changing it breaks existing links."
          value={block.anchor}
          onChange={(anchor) => onChange({ ...block, anchor })}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange({
              ...block,
              anchor: anchorFromText(spansToText(block.content)),
            })
          }
        >
          Regenerate from text
        </Button>
      </div>
    </div>
  );
}

export function ListEditor({
  block,
  onChange,
}: {
  block: ListBlock;
  onChange: (block: ListBlock) => void;
}) {
  return (
    <div className="ed-stack">
      <CheckField
        label="Numbered list"
        checked={block.ordered}
        onChange={(ordered) => onChange({ ...block, ordered })}
      />
      <ol className="ed-list-items">
        {block.items.map((item, index) => (
          <li key={item.id}>
            <SpanEditor
              ariaLabel={`List item ${index + 1}`}
              value={item.content}
              onChange={(content) =>
                onChange({
                  ...block,
                  items: block.items.map((entry) =>
                    entry.id === item.id ? { ...entry, content } : entry,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                onChange({
                  ...block,
                  items: block.items.filter((entry) => entry.id !== item.id),
                })
              }
            >
              Remove item
            </Button>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          onChange({
            ...block,
            items: [
              ...block.items,
              { id: newId("li"), content: [{ text: "" }] },
            ],
          })
        }
      >
        Add item
      </Button>
    </div>
  );
}

export function NoticeEditor({
  block,
  onChange,
}: {
  block: NoticeBlock;
  onChange: (block: NoticeBlock) => void;
}) {
  return (
    <div className="ed-stack">
      <SelectField
        label="Variant"
        value={block.variant}
        options={[
          { value: "info", label: "Information" },
          { value: "warning", label: "Warning" },
        ]}
        onChange={(variant) => onChange({ ...block, variant })}
      />
      <SpanEditor
        ariaLabel="Notice text"
        value={block.content}
        onChange={(content) => onChange({ ...block, content })}
      />
    </div>
  );
}

export function StartLinkEditor({
  block,
  onChange,
}: {
  block: StartLinkBlock;
  onChange: (block: StartLinkBlock) => void;
}) {
  return (
    <div className="ed-stack">
      <TextField
        label="Button label"
        value={block.label}
        onChange={(label) => onChange({ ...block, label })}
      />
      <SelectField
        label="Target kind"
        value={block.target_kind}
        options={[
          { value: "page", label: "A page on this site" },
          { value: "form", label: "A form (by form id)" },
          { value: "external", label: "An external URL" },
        ]}
        onChange={(target_kind) => onChange({ ...block, target_kind })}
      />
      <TextField
        label="Target"
        hint={
          block.target_kind === "page"
            ? "Must be a url that exists in content_pages (rule 8)."
            : undefined
        }
        value={block.target}
        onChange={(target) => onChange({ ...block, target })}
      />
    </div>
  );
}

export function ImagePlaceholderEditor({
  block,
  onChange,
}: {
  block: ImagePlaceholderBlock;
  onChange: (block: ImagePlaceholderBlock) => void;
}) {
  return (
    <div className="ed-stack">
      <p className="ed-note">
        No upload in this spike. This block exists so the palette contains one
        block with no content model at all.
      </p>
      <TextField
        label="Alt text"
        value={block.alt}
        onChange={(alt) => onChange({ ...block, alt })}
      />
      <TextField
        label="Caption"
        value={block.caption}
        onChange={(caption) => onChange({ ...block, caption })}
      />
    </div>
  );
}
