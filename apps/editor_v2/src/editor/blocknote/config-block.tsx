/**
 * A configuration block, inside the document.
 *
 * This is the shape the spike is really testing. A finder cannot be edited
 * by typing into it, but that does not mean it belongs in a pane beside the
 * document. Notion's answer for an inline database is that the block renders
 * the real thing in place, and its settings open from the block's own menu —
 * so that is what this does. Here the block is only ever the live output,
 * over the real records; "Edit" in the drag-handle menu opens the settings
 * popover.
 *
 * `contentEditable={false}` is not decoration. The block sits inside
 * ProseMirror's contenteditable, and without it the editor swallows clicks
 * and keystrokes meant for the rendered controls.
 */

import { useMemo } from "react";
import { RenderBlock, type Block } from "@govtech-bb/block-kit";
import { useEditorBlockContext } from "./context";

interface ConfigBlockShellProps {
  /** The canonical block, rebuilt from the JSON prop. */
  block: Block;
}

export function ConfigBlockShell({ block }: ConfigBlockShellProps) {
  const { data, refs, loading, errorsFor } = useEditorBlockContext();

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
    </div>
  );
}
