import { $getNearestNodeFromDOMNode, type LexicalEditor } from "lexical";
import { Repeat } from "@phosphor-icons/react";
import { useId } from "react";
import { cn } from "../../../cn";
import { Field } from "../../../ui/field";
import { Input } from "../../../ui/input";
import { govbbMarkerLabel, govbbRadio } from "../../../ui/govbb";
import { Switch } from "../../../ui/switch";
import { BoundsFields, SsbField } from "../../react/settings-controls";
import { $fieldArrayDrawingOf } from "./queries";
import {
  DEFAULT_REPEATABLE,
  withText,
  type PageRepeat,
  type Repeatable,
  type RepeatEnd,
} from "../../core/repetition";

/**
 * Further entries are previews, not editable copies. An unlabelled optional input's mark
 * can overlap a long legend, 28px above the box.
 */
export function markRepeats(editor: LexicalEditor) {
  return editor.registerUpdateListener(({ editorState }) => {
    const root = editor.getRootElement();

    if (!root) return;

    for (const legend of root.querySelectorAll<HTMLElement>("[data-repeat-legend]")) {
      const rest = legend.parentElement?.querySelector<HTMLElement>(":scope > [data-repeat-rest]");
      const box = legend.nextElementSibling;

      if (!rest || !(box instanceof HTMLElement)) continue;

      const drawing = editorState.read(
        () => {
          const node = $getNearestNodeFromDOMNode(legend);

          return node ? $fieldArrayDrawingOf(node) : null;
        },
        { editor },
      );

      const key = JSON.stringify([drawing, box.className]);

      if (rest.dataset.drawn === key) continue;
      rest.dataset.drawn = key;
      legend.hidden = rest.hidden = !drawing;

      if (!drawing) continue;
      legend.textContent = drawing.legends[0]!;

      const make = (className: string, text?: string) => {
        const el = legend.ownerDocument.createElement("div");
        el.className = className;

        if (text !== undefined) el.textContent = text;

        return el;
      };

      const rule = () => make("border-b-2 border-line pt-6");

      const button = (text: string, className: string) => {
        const span = legend.ownerDocument.createElement("span");
        span.className = className;
        span.textContent = text;

        return span;
      };

      rest.replaceChildren(rule());

      for (const [index, text] of drawing.legends.slice(1).entries()) {
        const entry = make("pt-8");
        const copy = box.cloneNode(true);

        if (!(copy instanceof HTMLElement)) continue;
        copy.querySelector("[data-optional]")?.remove();
        entry.append(
          make("cursor-default pb-2 text-20 leading-[1.4] font-semibold select-none", text),
          copy,
        );

        if (drawing.remove && index === drawing.legends.length - 2) {
          const remove = make("pt-4");
          remove.append(
            button("Remove", "text-error underline decoration-1 underline-offset-[0.1em]"),
          );
          entry.append(remove);
        }

        entry.append(rule());
        rest.append(entry);
      }

      if (drawing.add) {
        const add = make("pt-6");
        add.append(
          button(drawing.add, "text-green-80 underline decoration-1 underline-offset-[0.1em]"),
        );
        rest.append(add);
      }
    }
  });
}

/**
 * What SSB puts above the page's button. ponytail: an unseen copy in the next break keeps exactly its room,
 * with the same markup and width, so a question can wrap without measuring it.
 */
export function RepeatEndPreview({ end, room }: { end: RepeatEnd; room?: boolean }) {
  return (
    <div
      aria-hidden
      contentEditable={false}
      data-repeat-room={room ? "" : undefined}
      className={cn(
        "pb-2 text-(length:--form-text) leading-[1.5] select-none",
        room && "invisible",
      )}
    >
      <div className="flex h-6 items-center gap-1.5 text-12 font-semibold text-muted [&>svg]:size-3.5 [&>svg]:text-blue-40">
        <Repeat />
        {end.caption}
      </div>
      {end.question && (
        <>
          <p className="pt-1 pb-2 font-bold">{end.question}</p>
          {["Yes", "No"].map((label) => (
            <div key={label} className="flex items-start gap-4 pb-2">
              <span className={govbbRadio} />
              <span className={govbbMarkerLabel}>{label}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function RepeatChip({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 px-2 text-12 leading-4 font-semibold text-muted [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-blue-40">
      <Repeat />
      <span className="truncate max-md:sr-only">{text}</span>
    </div>
  );
}

export function RepeatSettings({
  repeat,
  onChange,
}: {
  repeat: PageRepeat;
  onChange: (next: Repeatable | undefined) => void;
}) {
  const id = useId();
  const { value } = repeat;

  return (
    <section className="mt-3 border-t border-line pt-3">
      <Switch
        label="Repeat this page"
        checked={!!value}
        onCheckedChange={(on) => onChange(on ? { ...DEFAULT_REPEATABLE } : undefined)}
        aria-describedby={`${id}-hint`}
        className="h-8 justify-between leading-5 font-semibold"
      />
      <p id={`${id}-hint`} className="mt-1.5 text-12 leading-4 text-muted">
        People fill in this page more than once, such as once for each child.
      </p>
      {value && (
        <>
          <BoundsFields
            className="mt-3"
            min={value.min}
            max={value.max}
            onChange={(bounds) => onChange({ ...value, ...bounds })}
          />
          <Field
            size="sm"
            label="Entry label"
            hint="Numbers the entries after the first, like ‘Child 2’, and goes into the question."
            className="mt-3"
          >
            <Input
              size="sm"
              defaultValue={value.instanceLabel ?? ""}
              placeholder="For example, Child"
              onChange={(e) => onChange(withText(value, "instanceLabel", e.target.value))}
            />
          </Field>
          {value.min < value.max && (
            <div className="-mx-3.5 mt-2">
              <SsbField
                label="Add another question"
                value={repeat.question}
                pinned={!!value.addAnotherLabel}
                onChange={(text) => onChange(withText(value, "addAnotherLabel", text ?? ""))}
              />
              {!value.instanceLabel && !value.addAnotherLabel && (
                <p className="px-3.5 pb-1.5 text-12 leading-4 text-muted">
                  Add an entry label to ask ‘Do you need to add another …?’
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
