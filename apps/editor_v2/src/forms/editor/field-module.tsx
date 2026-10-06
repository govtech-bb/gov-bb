import type { ComponentType, ReactNode } from "react";
import type { LexicalNode } from "lexical";
import { defineRenderer, defineSlot } from "../../editor/react/contributions";
import type { FormModule, ResolvedField } from "../field";
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

/** One installed unit owns its answer, menus, inspector and renderer contributions. */
export function fieldModule({
  field,
  key = `field:${field.kind}`,
  insertion,
  Controls,
  Preview,
  Renderer,
}: {
  key?: string;
  field: ResolvedField;
  insertion: FieldInsertion;
  Controls: ComponentType<{ m: BlockMenuModel; a: BlockMenuActions }>;
  Preview: ComponentType<FieldPreviewProps>;
  Renderer?: ComponentType<import("../react/widget-settings").WidgetProps>;
}): FormModule {
  const preview = (titled: boolean): ReactNode => (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
    >
      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
        {titled && <div className="font-bold leading-[1.5]">{insertion.question.label}</div>}
        {titled && insertion.question.hint && (
          <div className="leading-[1.5] text-muted">{insertion.question.hint}</div>
        )}
        <div className="mt-2">
          <Preview options={insertion.question.options} />
        </div>
      </div>
    </div>
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
