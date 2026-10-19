import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { ComponentType, ReactNode } from "react";
import { $getDocument, type LexicalNode } from "lexical";
import { defineRenderer, defineSlot } from "../../editor/react/contributions";
import { PreviewQuestion } from "../../ui/preview-sheet";
import type { ChoicePresentation, FormModule, ResolvedField } from "../field";
import type { BlockMenuActions, BlockMenuModel } from "../react/block-settings";
import { formInsertionAction } from "./insertion-action";
import { $createFieldLabel } from "./field-nodes";

export type FieldInsertion = {
  id: string;
  order: number;
  keywords?: string;
  create: () => LexicalNode[];
  question: { description: string; label: string; hint?: string; options?: string[] };
  answer: { description: string; hint?: string; options?: string[] };
};

export type FieldPreviewProps = {
  width?: "short" | "medium" | "long";
  mask?: string;
  options?: string[];
  more?: number;
};

/**
 * Something the form canvas draws, shown in a preview: `draw` builds the canvas's own DOM, as a read of the editor, so a
 * preview and the canvas can't disagree about a field. `width` is the question's field width, as on the canvas.
 */
export function CanvasDrawing({
  draw,
  width,
}: {
  draw: () => Node;
  width?: FieldPreviewProps["width"];
}) {
  const [editor] = useLexicalComposerContext();

  return (
    <div
      data-width={width}
      ref={(drawing) => {
        drawing?.replaceChildren(editor.getEditorState().read(draw, { editor }));
      }}
    />
  );
}

/** Each option as the canvas draws it, holding its label. */
function $drawOptions(choice: ChoicePresentation, options: readonly string[]) {
  const drawing = $getDocument().createDocumentFragment();

  for (const [index, option] of options.entries()) {
    const dom = choice.createDOM(index, () => {});
    dom.querySelector("[data-text]")!.textContent = option;
    drawing.append(dom);
  }

  return drawing;
}

/** A field previews as the canvas draws it, unless its module brings a preview: its options, or the box `draw` makes. */
function canvasPreview({ choice, draw, defaults, capabilities }: ResolvedField) {
  return function CanvasPreview({
    width = capabilities.width,
    mask,
    options = ["Yes", "No"],
    more = 0,
  }: FieldPreviewProps) {
    return (
      <>
        <CanvasDrawing
          width={width}
          draw={() =>
            choice ? $drawOptions(choice, options) : draw!(mask ? { ...defaults, mask } : defaults)
          }
        />
        {more > 0 && <p className="leading-[1.5] text-muted">and {more} more</p>}
      </>
    );
  };
}

/** One installed unit owns its answer, menus, inspector and renderer contributions. */
export function fieldModule({
  field,
  key = `field:${field.kind}`,
  insertion,
  Controls,
  Preview = canvasPreview(field),
  Renderer,
}: {
  key?: string;
  field: ResolvedField;
  insertion: FieldInsertion;
  Controls: ComponentType<{ m: BlockMenuModel; a: BlockMenuActions }>;
  Preview?: ComponentType<FieldPreviewProps>;
  Renderer?: ComponentType<import("../react/widget-settings").WidgetProps>;
}): FormModule {
  const preview = (titled: boolean): ReactNode =>
    titled ? (
      <PreviewQuestion label={insertion.question.label} hint={insertion.question.hint}>
        <Preview options={insertion.question.options} />
      </PreviewQuestion>
    ) : (
      <Preview options={insertion.question.options} />
    );

  function Inspector({ m, a }: { m: BlockMenuModel; a: BlockMenuActions }) {
    return !!m.header && m.kind === field.kind ? <Controls m={m} a={a} /> : null;
  }

  return {
    key,
    fields: [field],
    actions: [true, false].map((titled) =>
      formInsertionAction(
        {
          id: `${titled ? "question_" : ""}${insertion.id}`,
          title: field.label,
          kind: field.kind,
          icon: field.icon,
          description: titled ? insertion.question.description : insertion.answer.description,
          keywords: `${insertion.keywords ?? ""} ${titled ? "Question" : ""}`,
          create: () => [...(titled ? [$createFieldLabel()] : []), ...insertion.create()],
        },
        titled ? "Questions" : "Answer inputs",
        (titled ? 0 : 1000) + insertion.order,
        preview(titled),
      ),
    ),
    renderers: [
      defineRenderer(`field-preview:${field.kind}`, Preview),
      ...(Renderer ? [defineRenderer(`widget:${field.kind}`, Renderer)] : []),
    ],
    slots: [defineSlot(`field-settings:${field.kind}`, "form.block-settings", Inspector)],
  };
}
