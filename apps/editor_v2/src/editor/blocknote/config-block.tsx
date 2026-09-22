/**
 * A configuration block, inside the document.
 *
 * This is the shape the spike is really testing. A finder cannot be edited
 * by typing into it, but that does not mean it belongs in a pane beside the
 * document. Notion's answer for an inline database is that the block renders
 * the real thing and its settings open from controls attached to it — so
 * that is what this does. The block shows the live finder, over the real 163
 * records; hovering reveals "Configure"; the form opens in document flow
 * directly beneath.
 *
 * `contentEditable={false}` on every region here is not decoration. The
 * block sits inside ProseMirror's contenteditable, and without it the
 * editor swallows clicks and keystrokes meant for the form.
 */

import { useMemo, useState } from "react";
import { RenderBlock, type Block } from "@govtech-bb/block-kit";
import { BlockEditor } from "../blocks";
import { useEditorBlockContext } from "./context";

interface ConfigBlockShellProps {
  /** The canonical block, rebuilt from the JSON prop. */
  block: Block;
  onChange: (next: Block) => void;
}

export function ConfigBlockShell({ block, onChange }: ConfigBlockShellProps) {
  const { collections, data, refs, refKeys, loading, errorsFor } =
    useEditorBlockContext();
  const [open, setOpen] = useState(false);

  const errors = errorsFor(block.id);
  const ctx = useMemo(() => ({ data, refs, loading }), [data, refs, loading]);

  return (
    <div
      className={`bn-config${errors.length > 0 ? " bn-config-invalid" : ""}`}
      data-block-type={block.type}
    >
      {/*
        The real output, exactly as the site renders it. `bk-document` is
        not decoration: the renderer declares its CSS custom properties on
        that class, so without it every colour falls back to nothing and
        the GOV.BB start button renders invisible.
      */}
      <div className="bn-config-output bk-document" contentEditable={false}>
        <RenderBlock block={block} ctx={ctx} />
      </div>

      <div className="bn-config-bar" contentEditable={false}>
        <button
          type="button"
          className="bn-config-toggle"
          data-testid={`configure-${block.id}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Done" : "Configure"}
        </button>
        <span className="bn-config-kind">{block.type.replace("_", " ")}</span>
      </div>

      {errors.length > 0 ? (
        <ul
          className="bn-config-errors"
          data-testid={`block-error-${block.id}`}
          contentEditable={false}
        >
          {errors.map((error, index) => (
            <li key={index}>
              Rule {error.rule} — {error.message}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="bn-config-panel" contentEditable={false}>
          <BlockEditor
            block={block}
            onChange={onChange}
            collections={collections}
            refKeys={refKeys}
          />
        </div>
      ) : null}
    </div>
  );
}
