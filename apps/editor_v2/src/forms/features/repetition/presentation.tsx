import { $getNearestNodeFromDOMNode, type LexicalEditor } from "lexical";
import { Repeat } from "@phosphor-icons/react";
import { useId } from "react";
import { cn } from "../../../cn";
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
              <span className="size-(--form-marker) shrink-0 rounded-full border-2 border-ink bg-white" />
              <span className="pt-[calc((var(--form-marker)_-_1.5em)/2)]">{label}</span>
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
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(value ? undefined : { ...DEFAULT_REPEATABLE })}
        className="flex h-8 w-full items-center justify-between text-14 leading-5 font-semibold text-ink"
      >
        Repeat this page
        <span
          data-on={value ? "" : undefined}
          className="relative h-4.5 w-7.5 shrink-0 rounded-full bg-grey-60 data-on:bg-interactive"
        >
          <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white in-data-on:left-3.5" />
        </span>
      </button>
      <p className="mt-1.5 text-12 leading-4 text-muted">
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
          <label
            htmlFor={id}
            className="mt-3 mb-1.5 block text-14 leading-5 font-semibold text-ink"
          >
            Entry label
          </label>
          <input
            id={id}
            defaultValue={value.instanceLabel ?? ""}
            placeholder="For example, Child"
            onChange={(e) => onChange(withText(value, "instanceLabel", e.target.value))}
            className="h-9 w-full rounded-sm bg-white px-2.5 text-14 text-ink shadow-input outline-none placeholder:text-placeholder hover:shadow-input-hover focus:shadow-input-focus max-sm:text-16"
          />
          <p className="mt-2 text-12 leading-4 text-muted">
            Numbers the entries after the first, like ‘Child 2’, and goes into the question.
          </p>
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
